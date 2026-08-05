import { BACKGROUND_MODEL_LIMITS } from "../shared/config";
import type {
	BackgroundRemovalScope,
	Connectivity,
	Oklab,
	RawImage,
	RGB,
} from "../shared/types";
import { cloneImage } from "./image-operations";

export type BackgroundCluster = {
	color: Oklab;
	rgb: RGB;
	weight: number;
	borderCoverage: number;
	variance: number;
};

export type BackgroundModel = {
	clusters: BackgroundCluster[];
	confidence: number;
	borderBandRatio: number;
};

export type AutomaticBackgroundResult = {
	image: RawImage;
	model: BackgroundModel;
	removedRatio: number;
	rolledBack: boolean;
};

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

const srgbToLinear = (value: number): number => {
	const normalized = value / 255;
	return normalized <= 0.04045
		? normalized / 12.92
		: ((normalized + 0.055) / 1.055) ** 2.4;
};

const writeOklab = (
	r: number,
	g: number,
	b: number,
	outputL: Float64Array,
	outputA: Float64Array,
	outputB: Float64Array,
	index: number,
): void => {
	const linearR = srgbToLinear(r);
	const linearG = srgbToLinear(g);
	const linearB = srgbToLinear(b);
	const l =
		0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB;
	const m =
		0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB;
	const s =
		0.0883024619 * linearR + 0.2817188501 * linearG + 0.6299787005 * linearB;
	const cubeL = Math.cbrt(l);
	const cubeM = Math.cbrt(m);
	const cubeS = Math.cbrt(s);
	outputL[index] =
		0.2104542553 * cubeL + 0.793617785 * cubeM - 0.0040720468 * cubeS;
	outputA[index] =
		1.9779984951 * cubeL - 2.428592205 * cubeM + 0.4505937099 * cubeS;
	outputB[index] =
		0.0259040371 * cubeL + 0.7827717662 * cubeM - 0.808675766 * cubeS;
};

// [Intended] 値が a と b を線形補間した範囲（tolerance の余裕込み）に収まるかを判定する。
// 真のアンチエイリアシング縁は背景色と内側画素の色の中間になるため、この範囲に収まる。
// 範囲外なら背景とは無関係な被写体自身の色とみなし、dehalo の補正対象から外す。
const isWithinBlendRange = (
	value: number,
	a: number,
	b: number,
	tolerance: number,
): boolean => {
	const lower = Math.min(a, b) - tolerance;
	const upper = Math.max(a, b) + tolerance;
	return value >= lower && value <= upper;
};

const distanceSquared = (
	l: number,
	a: number,
	b: number,
	centroidL: number,
	centroidA: number,
	centroidB: number,
): number => {
	const deltaL = l - centroidL;
	const deltaA = a - centroidA;
	const deltaB = b - centroidB;
	return deltaL * deltaL + deltaA * deltaA + deltaB * deltaB;
};

const getBandSize = (width: number, height: number): number =>
	Math.max(
		BACKGROUND_MODEL_LIMITS.minBorderBandPixels,
		Math.ceil(
			Math.min(width, height) * BACKGROUND_MODEL_LIMITS.borderBandRatio,
		),
	);

const isInBorderBand = (
	x: number,
	y: number,
	width: number,
	height: number,
	band: number,
): boolean => x < band || y < band || x >= width - band || y >= height - band;

export const estimateBackgroundModel = (img: RawImage): BackgroundModel => {
	const width = img.width;
	const height = img.height;
	const band = getBandSize(width, height);
	let opaqueCount = 0;
	let transparentCount = 0;
	// [Intended] 境界帯ガード専用の「透明とみなす」画素数。完全透明に加え、ブラーや
	// リサイズで生じる半透明のにじみ画素（アンチエイリアシング縁）も含める。にじみ画素は
	// alpha 自身がすでに被写体がそこで薄れて消えていることを表しており、境界帯の大半が
	// これで占められる画像は「被写体の輪郭が画像端に達しただけ」であって、色クラスタ推定は
	// その輪郭色を背景と誤認するリスクが高い。色サンプリングや confidence の重みには従来通り
	// opaqueCount/transparentCount（完全透明のみを透明扱い）を使い、この値はガード判定にのみ使う。
	let guardTransparentCount = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (!isInBorderBand(x, y, width, height, band)) continue;
			const alpha = img.data[(y * width + x) * 4 + 3];
			if (alpha === 0) transparentCount += 1;
			else opaqueCount += 1;
			if (alpha !== 255) guardTransparentCount += 1;
		}
	}
	const totalBorderCount = opaqueCount + transparentCount;
	if (opaqueCount === 0) {
		return {
			clusters: [],
			confidence: totalBorderCount === 0 ? 0 : 1,
			borderBandRatio: BACKGROUND_MODEL_LIMITS.borderBandRatio,
		};
	}
	// [Intended] 境界帯の相当部分がすでに透明（半透明のにじみを含む）なら、その画像はアルファで
	// 背景を表現済みとみなし、色による背景推定を行わない。切り抜き済み画像に残る不透明な境界画素は
	// 「画像端に接した被写体」であり、色クラスタとして背景に採用すると被写体の外縁（アウトライン）を
	// 削ってしまう。アルファが背景を確定させている状況なので confidence は最大とし、
	// 後段の小領域除去は許可する。
	if (
		guardTransparentCount / totalBorderCount >=
		BACKGROUND_MODEL_LIMITS.alphaBackgroundBorderRatio
	) {
		return {
			clusters: [],
			confidence: 1,
			borderBandRatio: BACKGROUND_MODEL_LIMITS.borderBandRatio,
		};
	}

	// [Intended] 境界帯は画像サイズに比例して大きくなるため、決定論的な等間隔サンプリングで
	// サンプル数に上限を設ける。比率として使う統計量のみを取るので間引いても評価軸は変わらない。
	const sampleStride = Math.max(
		1,
		Math.ceil(opaqueCount / BACKGROUND_MODEL_LIMITS.maxBorderSamples),
	);
	const sampleCount = Math.ceil(opaqueCount / sampleStride);
	const labsL = new Float64Array(sampleCount);
	const labsA = new Float64Array(sampleCount);
	const labsB = new Float64Array(sampleCount);
	const reds = new Uint8Array(sampleCount);
	const greens = new Uint8Array(sampleCount);
	const blues = new Uint8Array(sampleCount);
	const outermost = new Uint8Array(sampleCount);
	let sampleIndex = 0;
	let opaqueIndex = 0;
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (!isInBorderBand(x, y, width, height, band)) continue;
			const offset = (y * width + x) * 4;
			if (img.data[offset + 3] === 0) continue;
			const currentOpaqueIndex = opaqueIndex;
			opaqueIndex += 1;
			if (currentOpaqueIndex % sampleStride !== 0) continue;
			const r = img.data[offset];
			const g = img.data[offset + 1];
			const b = img.data[offset + 2];
			reds[sampleIndex] = r;
			greens[sampleIndex] = g;
			blues[sampleIndex] = b;
			outermost[sampleIndex] =
				x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0;
			writeOklab(r, g, b, labsL, labsA, labsB, sampleIndex);
			sampleIndex += 1;
		}
	}

	const clusterLimit = Math.min(
		BACKGROUND_MODEL_LIMITS.maxClusters,
		sampleCount,
	);
	const centroidL = new Float64Array(clusterLimit);
	const centroidA = new Float64Array(clusterLimit);
	const centroidB = new Float64Array(clusterLimit);
	let meanL = 0;
	let meanA = 0;
	let meanB = 0;
	for (let i = 0; i < sampleCount; i += 1) {
		meanL += labsL[i];
		meanA += labsA[i];
		meanB += labsB[i];
	}
	centroidL[0] = meanL / sampleCount;
	centroidA[0] = meanA / sampleCount;
	centroidB[0] = meanB / sampleCount;
	for (let cluster = 1; cluster < clusterLimit; cluster += 1) {
		let farthestIndex = 0;
		let farthestDistance = -1;
		for (let i = 0; i < sampleCount; i += 1) {
			let nearestDistance = Number.POSITIVE_INFINITY;
			for (let current = 0; current < cluster; current += 1) {
				nearestDistance = Math.min(
					nearestDistance,
					distanceSquared(
						labsL[i],
						labsA[i],
						labsB[i],
						centroidL[current],
						centroidA[current],
						centroidB[current],
					),
				);
			}
			if (nearestDistance > farthestDistance) {
				farthestDistance = nearestDistance;
				farthestIndex = i;
			}
		}
		centroidL[cluster] = labsL[farthestIndex];
		centroidA[cluster] = labsA[farthestIndex];
		centroidB[cluster] = labsB[farthestIndex];
	}

	const assignments = new Uint8Array(sampleCount);
	const counts = new Uint32Array(clusterLimit);
	const outerCounts = new Uint32Array(clusterLimit);
	const sumL = new Float64Array(clusterLimit);
	const sumA = new Float64Array(clusterLimit);
	const sumB = new Float64Array(clusterLimit);
	const sumR = new Float64Array(clusterLimit);
	const sumG = new Float64Array(clusterLimit);
	const sumRgbB = new Float64Array(clusterLimit);
	for (
		let iteration = 0;
		iteration < BACKGROUND_MODEL_LIMITS.clusterIterations;
		iteration += 1
	) {
		counts.fill(0);
		sumL.fill(0);
		sumA.fill(0);
		sumB.fill(0);
		for (let i = 0; i < sampleCount; i += 1) {
			let nearestCluster = 0;
			let nearestDistance = Number.POSITIVE_INFINITY;
			for (let cluster = 0; cluster < clusterLimit; cluster += 1) {
				const distance = distanceSquared(
					labsL[i],
					labsA[i],
					labsB[i],
					centroidL[cluster],
					centroidA[cluster],
					centroidB[cluster],
				);
				if (distance < nearestDistance) {
					nearestDistance = distance;
					nearestCluster = cluster;
				}
			}
			assignments[i] = nearestCluster;
			counts[nearestCluster] += 1;
			sumL[nearestCluster] += labsL[i];
			sumA[nearestCluster] += labsA[i];
			sumB[nearestCluster] += labsB[i];
		}
		for (let cluster = 0; cluster < clusterLimit; cluster += 1) {
			if (counts[cluster] === 0) continue;
			centroidL[cluster] = sumL[cluster] / counts[cluster];
			centroidA[cluster] = sumA[cluster] / counts[cluster];
			centroidB[cluster] = sumB[cluster] / counts[cluster];
		}
	}

	counts.fill(0);
	outerCounts.fill(0);
	sumR.fill(0);
	sumG.fill(0);
	sumRgbB.fill(0);
	const varianceSums = new Float64Array(clusterLimit);
	let outerOpaqueCount = 0;
	for (let i = 0; i < sampleCount; i += 1) {
		const cluster = assignments[i];
		counts[cluster] += 1;
		sumR[cluster] += reds[i];
		sumG[cluster] += greens[i];
		sumRgbB[cluster] += blues[i];
		varianceSums[cluster] += distanceSquared(
			labsL[i],
			labsA[i],
			labsB[i],
			centroidL[cluster],
			centroidA[cluster],
			centroidB[cluster],
		);
		if (outermost[i]) {
			outerCounts[cluster] += 1;
			outerOpaqueCount += 1;
		}
	}

	const clusters: BackgroundCluster[] = [];
	let modeledWeight = transparentCount / Math.max(1, totalBorderCount);
	let weightedVariance = 0;
	for (let cluster = 0; cluster < clusterLimit; cluster += 1) {
		if (counts[cluster] === 0) continue;
		const weight = counts[cluster] / sampleCount;
		// [Intended] 最外周が全て透明な画像（透明パディング付き PNG など）では borderCoverage が
		// 常に 0 になり全クラスタが落ちてしまうため、基準が無い場合は weight のみで足切りする。
		const hasOuterReference = outerOpaqueCount > 0;
		const borderCoverage = hasOuterReference
			? outerCounts[cluster] / outerOpaqueCount
			: 0;
		if (
			weight < BACKGROUND_MODEL_LIMITS.minClusterWeight ||
			(hasOuterReference &&
				borderCoverage < BACKGROUND_MODEL_LIMITS.minClusterWeight)
		) {
			continue;
		}
		const variance = varianceSums[cluster] / counts[cluster];
		clusters.push({
			color: {
				L: centroidL[cluster],
				a: centroidA[cluster],
				b: centroidB[cluster],
			},
			rgb: {
				r: Math.round(sumR[cluster] / counts[cluster]),
				g: Math.round(sumG[cluster] / counts[cluster]),
				b: Math.round(sumRgbB[cluster] / counts[cluster]),
			},
			weight,
			borderCoverage,
			variance,
		});
		modeledWeight +=
			(counts[cluster] / sampleCount) *
			(opaqueCount / Math.max(1, totalBorderCount));
		weightedVariance += variance * weight;
	}
	clusters.sort(
		(left, right) =>
			right.borderCoverage - left.borderCoverage ||
			right.weight - left.weight ||
			left.color.L - right.color.L ||
			left.color.a - right.color.a ||
			left.color.b - right.color.b,
	);
	const varianceConfidence = clampUnit(
		1 - weightedVariance / BACKGROUND_MODEL_LIMITS.varianceConfidenceScale,
	);
	return {
		clusters,
		confidence: clampUnit(modeledWeight * (0.35 + 0.65 * varianceConfidence)),
		borderBandRatio: BACKGROUND_MODEL_LIMITS.borderBandRatio,
	};
};

const buildCandidateMask = (
	img: RawImage,
	model: BackgroundModel,
	tolerance: number,
): Uint8Array => {
	const pixelCount = img.width * img.height;
	const mask = new Uint8Array(pixelCount);
	const labL = new Float64Array(1);
	const labA = new Float64Array(1);
	const labB = new Float64Array(1);
	const normalizedTolerance =
		BACKGROUND_MODEL_LIMITS.baseOklabTolerance +
		(tolerance / 255) *
			(BACKGROUND_MODEL_LIMITS.maxOklabTolerance -
				BACKGROUND_MODEL_LIMITS.baseOklabTolerance);
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const offset = pixel * 4;
		const alpha = img.data[offset + 3];
		if (alpha === 0) {
			mask[pixel] = 1;
			continue;
		}
		// [Policy] 既存の半透明境界は利用者のアルファを優先し、自動除去しない。
		if (alpha < 255) continue;
		writeOklab(
			img.data[offset],
			img.data[offset + 1],
			img.data[offset + 2],
			labL,
			labA,
			labB,
			0,
		);
		for (let cluster = 0; cluster < model.clusters.length; cluster += 1) {
			const candidate = model.clusters[cluster];
			const adaptiveTolerance = Math.min(
				BACKGROUND_MODEL_LIMITS.maxOklabTolerance,
				normalizedTolerance +
					Math.sqrt(candidate.variance) * BACKGROUND_MODEL_LIMITS.varianceScale,
			);
			if (
				distanceSquared(
					labL[0],
					labA[0],
					labB[0],
					candidate.color.L,
					candidate.color.a,
					candidate.color.b,
				) <=
				adaptiveTolerance * adaptiveTolerance
			) {
				mask[pixel] = 1;
				break;
			}
		}
	}
	return mask;
};

const markConnectedBackground = (
	img: RawImage,
	candidates: Uint8Array,
	connectivity: Connectivity,
): Uint8Array => {
	const width = img.width;
	const height = img.height;
	const selected = new Uint8Array(width * height);
	const queue = new Uint32Array(width * height);
	let head = 0;
	let tail = 0;
	const enqueue = (pixel: number): void => {
		if (!candidates[pixel] || selected[pixel]) return;
		selected[pixel] = 1;
		queue[tail] = pixel;
		tail += 1;
	};
	for (let x = 0; x < width; x += 1) {
		enqueue(x);
		if (height > 1) enqueue((height - 1) * width + x);
	}
	for (let y = 1; y + 1 < height; y += 1) {
		enqueue(y * width);
		if (width > 1) enqueue(y * width + width - 1);
	}
	while (head < tail) {
		const pixel = queue[head];
		head += 1;
		const x = pixel % width;
		const y = (pixel / width) | 0;
		if (x > 0) enqueue(pixel - 1);
		if (x + 1 < width) enqueue(pixel + 1);
		if (y > 0) enqueue(pixel - width);
		if (y + 1 < height) enqueue(pixel + width);
		if (connectivity === "8") {
			if (x > 0 && y > 0) enqueue(pixel - width - 1);
			if (x + 1 < width && y > 0) enqueue(pixel - width + 1);
			if (x > 0 && y + 1 < height) enqueue(pixel + width - 1);
			if (x + 1 < width && y + 1 < height) enqueue(pixel + width + 1);
		}
	}
	return selected;
};

const applyDehalo = (img: RawImage, model: BackgroundModel): void => {
	if (model.clusters.length === 0) return;
	const width = img.width;
	const height = img.height;
	const pixelCount = width * height;
	const boundaryDistance = new Uint8Array(pixelCount);
	const queue = new Uint32Array(pixelCount);
	let head = 0;
	let tail = 0;
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		if (img.data[pixel * 4 + 3] !== 0) continue;
		boundaryDistance[pixel] = 1;
		queue[tail] = pixel;
		tail += 1;
	}
	while (head < tail) {
		const pixel = queue[head];
		head += 1;
		const distance = boundaryDistance[pixel];
		// [Intended] dehaloRadius は「補正する深さ」であり、最も内側の補正対象
		// （距離 dehaloRadius + 1）も内側の参照先を必要とするため、距離ラベルは 1 段深くまで付ける。
		if (distance > BACKGROUND_MODEL_LIMITS.dehaloRadius + 1) continue;
		const x = pixel % width;
		const y = (pixel / width) | 0;
		if (x > 0 && boundaryDistance[pixel - 1] === 0) {
			boundaryDistance[pixel - 1] = distance + 1;
			queue[tail] = pixel - 1;
			tail += 1;
		}
		if (x + 1 < width && boundaryDistance[pixel + 1] === 0) {
			boundaryDistance[pixel + 1] = distance + 1;
			queue[tail] = pixel + 1;
			tail += 1;
		}
		if (y > 0 && boundaryDistance[pixel - width] === 0) {
			boundaryDistance[pixel - width] = distance + 1;
			queue[tail] = pixel - width;
			tail += 1;
		}
		if (y + 1 < height && boundaryDistance[pixel + width] === 0) {
			boundaryDistance[pixel + width] = distance + 1;
			queue[tail] = pixel + width;
			tail += 1;
		}
	}
	const source = new Uint8ClampedArray(img.data);
	for (let pixel = 0; pixel < pixelCount; pixel += 1) {
		const distance = boundaryDistance[pixel];
		const offset = pixel * 4;
		if (
			distance < 2 ||
			distance > BACKGROUND_MODEL_LIMITS.dehaloRadius + 1 ||
			source[offset + 3] !== 255
		) {
			continue;
		}
		const x = pixel % width;
		const y = (pixel / width) | 0;
		let bestNeighbor = -1;
		let bestDistance = distance;
		const left = x > 0 ? pixel - 1 : -1;
		const right = x + 1 < width ? pixel + 1 : -1;
		const up = y > 0 ? pixel - width : -1;
		const down = y + 1 < height ? pixel + width : -1;
		for (let direction = 0; direction < 4; direction += 1) {
			const neighbor =
				direction === 0
					? left
					: direction === 1
						? right
						: direction === 2
							? up
							: down;
			if (neighbor < 0) continue;
			const neighborOffset = neighbor * 4;
			if (
				source[neighborOffset + 3] === 255 &&
				boundaryDistance[neighbor] > bestDistance
			) {
				bestNeighbor = neighbor;
				bestDistance = boundaryDistance[neighbor];
			}
		}
		if (bestNeighbor < 0) continue;
		let nearestBackgroundDistance = Number.POSITIVE_INFINITY;
		let nearestCluster = 0;
		for (let cluster = 0; cluster < model.clusters.length; cluster += 1) {
			const background = model.clusters[cluster].rgb;
			const deltaR = source[offset] - background.r;
			const deltaG = source[offset + 1] - background.g;
			const deltaB = source[offset + 2] - background.b;
			const rgbDistance = deltaR * deltaR + deltaG * deltaG + deltaB * deltaB;
			if (rgbDistance < nearestBackgroundDistance) {
				nearestBackgroundDistance = rgbDistance;
				nearestCluster = cluster;
			}
		}
		if (
			nearestBackgroundDistance >
			BACKGROUND_MODEL_LIMITS.dehaloMaxRgbDistance *
				BACKGROUND_MODEL_LIMITS.dehaloMaxRgbDistance
		) {
			continue;
		}
		const neighborOffset = bestNeighbor * 4;
		const background = model.clusters[nearestCluster].rgb;
		// [Intended] 背景色ともう一方の内側参照画素の色を線形補間した範囲に現在の画素が
		// 収まらないなら、それはアンチエイリアシングの混色ではなく被写体自身が意図した色
		// （背景と無関係な輪郭色など）である。誤って動かすと輪郭色を壊すので補正を見送る。
		const tolerance = BACKGROUND_MODEL_LIMITS.dehaloBetweennessTolerance;
		const isAntiAliasBlend =
			isWithinBlendRange(
				source[offset],
				background.r,
				source[neighborOffset],
				tolerance,
			) &&
			isWithinBlendRange(
				source[offset + 1],
				background.g,
				source[neighborOffset + 1],
				tolerance,
			) &&
			isWithinBlendRange(
				source[offset + 2],
				background.b,
				source[neighborOffset + 2],
				tolerance,
			);
		if (!isAntiAliasBlend) continue;
		for (let channel = 0; channel < 3; channel += 1) {
			const current = source[offset + channel];
			const interior = source[neighborOffset + channel];
			const backgroundValue =
				channel === 0
					? background.r
					: channel === 1
						? background.g
						: background.b;
			const awayFromBackground =
				current +
				(current - backgroundValue) *
					BACKGROUND_MODEL_LIMITS.dehaloPushStrength;
			const target =
				awayFromBackground * BACKGROUND_MODEL_LIMITS.dehaloSourceBlend +
				interior * BACKGROUND_MODEL_LIMITS.dehaloInteriorBlend;
			const delta = Math.max(
				-BACKGROUND_MODEL_LIMITS.dehaloMaxChannelChange,
				Math.min(
					BACKGROUND_MODEL_LIMITS.dehaloMaxChannelChange,
					target - current,
				),
			);
			img.data[offset + channel] = Math.round(current + delta);
		}
	}
};

export const removeAutomaticBackground = (
	img: RawImage,
	tolerance: number,
	scope: BackgroundRemovalScope,
	connectivity: Connectivity,
	providedModel?: BackgroundModel,
): AutomaticBackgroundResult => {
	const model = providedModel ?? estimateBackgroundModel(img);
	if (
		scope === "off" ||
		model.clusters.length === 0 ||
		model.confidence < BACKGROUND_MODEL_LIMITS.minConfidence
	) {
		return {
			image: cloneImage(img),
			model,
			removedRatio: 0,
			rolledBack: false,
		};
	}
	const candidates = buildCandidateMask(img, model, tolerance);
	// [Intended] Auto には角の選択が無いため、"selected" は "outer" と同じく画像端全周からの
	// 連結判定として扱う。角シードを持つのはレガシー抽出方式だけである。
	const selected =
		scope === "all"
			? candidates
			: markConnectedBackground(img, candidates, connectivity);
	let opaqueBefore = 0;
	let removed = 0;
	for (let pixel = 0; pixel < img.width * img.height; pixel += 1) {
		const alpha = img.data[pixel * 4 + 3];
		if (alpha === 0) continue;
		opaqueBefore += 1;
		if (selected[pixel]) removed += 1;
	}
	const removedRatio = opaqueBefore === 0 ? 0 : removed / opaqueBefore;
	if (removedRatio > BACKGROUND_MODEL_LIMITS.maxContentLossRatio) {
		return {
			image: cloneImage(img),
			model,
			removedRatio,
			rolledBack: true,
		};
	}
	const output = cloneImage(img);
	for (let pixel = 0; pixel < selected.length; pixel += 1) {
		if (selected[pixel] && output.data[pixel * 4 + 3] === 255) {
			output.data[pixel * 4 + 3] = 0;
		}
	}
	applyDehalo(output, model);
	return { image: output, model, removedRatio, rolledBack: false };
};
