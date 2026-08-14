import { CONVERT_DETAIL_SCALES, CONVERT_LIMITS } from "../shared/config";
import type { ConvertCandidate, DetailLevel, RawImage } from "../shared/types";

const LABELS = ["coarse", "balanced", "detailed"] as const;

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

const pixelLuminance = (data: Uint8ClampedArray, index: number): number => {
	const alpha = data[index + 3] / 255;
	return (
		((0.2126 * data[index] +
			0.7152 * data[index + 1] +
			0.0722 * data[index + 2]) *
			alpha) /
		255
	);
};

const analyzeInformation = (image: RawImage): number => {
	const { width, height, data } = image;
	const pixelCount = width * height;
	if (pixelCount === 0) return 0;
	const stride = Math.max(
		1,
		Math.ceil(Math.sqrt(pixelCount / CONVERT_LIMITS.maxAnalysisPixels)),
	);
	const colors = new Set<number>();
	let sampled = 0;
	let visible = 0;
	let edges = 0;
	let comparisons = 0;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	// [Intended] stride > 1 のとき原点を固定して間引くと、透明と不透明が交互に並ぶ画像で
	// 片方の位相だけを読み、入力が 1 列増えただけで情報量が不連続に変わる。
	// 行ごとに位相をずらした決定論的な層化サンプリングにして位相エイリアシングを避ける。
	const columns = Math.ceil(width / stride);
	const rows = Math.ceil(height / stride);
	for (let sy = 0; sy < rows; sy += 1) {
		const phase = sy % stride;
		const y = Math.min(height - 1, sy * stride + phase);
		for (let sx = 0; sx < columns; sx += 1) {
			const x = Math.min(width - 1, sx * stride + ((sx + phase) % stride));
			const index = (y * width + x) * 4;
			sampled += 1;
			if (data[index + 3] > 15) {
				visible += 1;
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
				const key =
					((data[index] >> 4) << 8) |
					((data[index + 1] >> 4) << 4) |
					(data[index + 2] >> 4);
				colors.add(key);
			}
			const luminance = pixelLuminance(data, index);
			if (x + stride < width) {
				const right = pixelLuminance(data, index + stride * 4);
				if (Math.abs(luminance - right) >= CONVERT_LIMITS.edgeThreshold) {
					edges += 1;
				}
				comparisons += 1;
			}
			if (y + stride < height) {
				const below = pixelLuminance(data, index + stride * width * 4);
				if (Math.abs(luminance - below) >= CONVERT_LIMITS.edgeThreshold) {
					edges += 1;
				}
				comparisons += 1;
			}
		}
	}
	const uniqueRatio = visible === 0 ? 0 : colors.size / visible;
	const edgeDensity = comparisons === 0 ? 0 : edges / comparisons;
	const subjectRatio =
		maxX < minX
			? 0
			: ((maxX - minX + stride) * (maxY - minY + stride)) / (width * height);
	const visibleRatio = sampled === 0 ? 0 : visible / sampled;
	return clamp(
		Math.sqrt(uniqueRatio) * 0.35 +
			Math.sqrt(edgeDensity) * 0.35 +
			Math.sqrt(subjectRatio * visibleRatio) * 0.3,
		0,
		1,
	);
};

const dimensionsForShortSide = (
	image: RawImage,
	shortSide: number,
): { outW: number; outH: number } => {
	if (image.width <= image.height) {
		return {
			outW: Math.min(image.width, shortSide),
			outH: Math.min(
				image.height,
				Math.max(1, Math.round((shortSide * image.height) / image.width)),
			),
		};
	}
	return {
		outW: Math.min(
			image.width,
			Math.max(1, Math.round((shortSide * image.width) / image.height)),
		),
		outH: Math.min(image.height, shortSide),
	};
};

export const createConvertCandidates = (
	image: RawImage,
): ConvertCandidate[] => {
	const sourceShort = Math.max(1, Math.min(image.width, image.height));
	const areaBased =
		Math.sqrt(Math.max(1, image.width * image.height)) /
		CONVERT_LIMITS.baseAreaDivisor;
	const information = analyzeInformation(image);
	const balancedShort = clamp(
		Math.round(
			areaBased *
				(1 + (information - 0.5) * CONVERT_LIMITS.informationAdjustment),
		),
		Math.min(sourceShort, CONVERT_LIMITS.minShortSide),
		Math.min(sourceShort, CONVERT_LIMITS.maxShortSide),
	);

	return LABELS.map((label) => {
		const shortSide = clamp(
			Math.round(balancedShort * CONVERT_DETAIL_SCALES[label]),
			1,
			sourceShort,
		);
		return {
			label,
			...dimensionsForShortSide(image, shortSide),
		};
	});
};

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
	target: Float64Array,
	offset = 0,
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
	const rootL = Math.cbrt(l);
	const rootM = Math.cbrt(m);
	const rootS = Math.cbrt(s);
	target[offset] =
		0.2104542553 * rootL + 0.793617785 * rootM - 0.0040720468 * rootS;
	target[offset + 1] =
		1.9779984951 * rootL - 2.428592205 * rootM + 0.4505937099 * rootS;
	target[offset + 2] =
		0.0259040371 * rootL + 0.7827717662 * rootM - 0.808675766 * rootS;
};

const createEdgeMap = (image: RawImage): Float32Array => {
	const { width, height, data } = image;
	const edges = new Float32Array(width * height);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = y * width + x;
			const index = pixel * 4;
			const center = pixelLuminance(data, index);
			let difference = 0;
			let neighbors = 0;
			if (x > 0) {
				difference += Math.abs(center - pixelLuminance(data, index - 4));
				neighbors += 1;
			}
			if (x + 1 < width) {
				difference += Math.abs(center - pixelLuminance(data, index + 4));
				neighbors += 1;
			}
			if (y > 0) {
				difference += Math.abs(
					center - pixelLuminance(data, index - width * 4),
				);
				neighbors += 1;
			}
			if (y + 1 < height) {
				difference += Math.abs(
					center - pixelLuminance(data, index + width * 4),
				);
				neighbors += 1;
			}
			edges[pixel] = neighbors === 0 ? 0 : difference / neighbors;
		}
	}
	return edges;
};

export const edgeAwareAreaResample = (
	image: RawImage,
	outW: number,
	outH: number,
): RawImage => {
	const width = Math.max(1, Math.min(image.width, Math.trunc(outW)));
	const height = Math.max(1, Math.min(image.height, Math.trunc(outH)));
	const output = new Uint8ClampedArray(width * height * 4);
	const edges = createEdgeMap(image);
	const scaleX = image.width / width;
	const scaleY = image.height / height;
	// [Intended] 1 セルが覆う元画素の最大数ぶんだけ Oklab の使い回しバッファを先に確保する。
	// ループ内で確保せず、2 パス目は 1 パス目の変換結果を読むだけにする。
	const cellStride = Math.ceil(scaleX) + 1;
	const labCache = new Float64Array(cellStride * (Math.ceil(scaleY) + 1) * 3);
	for (let outY = 0; outY < height; outY += 1) {
		const sourceTop = outY * scaleY;
		const sourceBottom = (outY + 1) * scaleY;
		const firstY = Math.floor(sourceTop);
		const lastY = Math.min(image.height - 1, Math.ceil(sourceBottom) - 1);
		for (let outX = 0; outX < width; outX += 1) {
			const sourceLeft = outX * scaleX;
			const sourceRight = (outX + 1) * scaleX;
			const firstX = Math.floor(sourceLeft);
			const lastX = Math.min(image.width - 1, Math.ceil(sourceRight) - 1);
			let areaWeight = 0;
			let alphaWeight = 0;
			let visibleWeight = 0;
			let meanL = 0;
			let meanA = 0;
			let meanB = 0;
			for (let y = firstY; y <= lastY; y += 1) {
				const overlapY = Math.min(sourceBottom, y + 1) - Math.max(sourceTop, y);
				for (let x = firstX; x <= lastX; x += 1) {
					const overlapX =
						Math.min(sourceRight, x + 1) - Math.max(sourceLeft, x);
					const pixel = y * image.width + x;
					const index = pixel * 4;
					const edgeWeight = 1 + edges[pixel] * CONVERT_LIMITS.edgeBoost;
					const weightedArea = overlapX * overlapY * edgeWeight;
					const alpha = image.data[index + 3] / 255;
					const weightedVisible = weightedArea * alpha;
					areaWeight += weightedArea;
					alphaWeight += weightedVisible;
					if (alpha <= 0) continue;
					const cacheAt = ((y - firstY) * cellStride + (x - firstX)) * 3;
					writeOklab(
						image.data[index],
						image.data[index + 1],
						image.data[index + 2],
						labCache,
						cacheAt,
					);
					if (weightedVisible <= 0) continue;
					visibleWeight += weightedVisible;
					meanL += labCache[cacheAt] * weightedVisible;
					meanA += labCache[cacheAt + 1] * weightedVisible;
					meanB += labCache[cacheAt + 2] * weightedVisible;
				}
			}
			const target = (outY * width + outX) * 4;
			if (visibleWeight <= 0 || areaWeight <= 0) continue;
			meanL /= visibleWeight;
			meanA /= visibleWeight;
			meanB /= visibleWeight;
			let bestDistance = Number.POSITIVE_INFINITY;
			let bestIndex = 0;
			let featureDistance = 0;
			let featureCoverage = 0;
			let featureIndex = 0;
			for (let y = firstY; y <= lastY; y += 1) {
				const overlapY = Math.min(sourceBottom, y + 1) - Math.max(sourceTop, y);
				for (let x = firstX; x <= lastX; x += 1) {
					const pixel = y * image.width + x;
					const index = pixel * 4;
					const alpha = image.data[index + 3];
					if (alpha === 0) continue;
					const cacheAt = ((y - firstY) * cellStride + (x - firstX)) * 3;
					const deltaL = labCache[cacheAt] - meanL;
					const deltaA = labCache[cacheAt + 1] - meanA;
					const deltaB = labCache[cacheAt + 2] - meanB;
					const rawDistance =
						deltaL * deltaL + deltaA * deltaA + deltaB * deltaB;
					// [Intended] ほぼ透明な画素の RGB をそのまま代表色にすると、出力側の
					// alpha はセル平均で決まるため、見えない色が不透明な点やハローとして現れる。
					// 距離と面積被覆率を alpha で重み付けし、候補から外さずに優先度だけ下げる。
					const visibility = alpha / 255;
					const distance = rawDistance / ((1 + edges[pixel]) * visibility);
					if (distance < bestDistance) {
						bestDistance = distance;
						bestIndex = index;
					}
					const overlapX =
						Math.min(sourceRight, x + 1) - Math.max(sourceLeft, x);
					const coverage =
						((overlapX * overlapY) / (scaleX * scaleY)) * visibility;
					const featureScore = rawDistance * visibility;
					if (featureScore > featureDistance) {
						featureDistance = featureScore;
						featureCoverage = coverage;
						featureIndex = index;
					}
				}
			}
			// [Intended] セル面積の一部を占める高コントラスト色は、平均色に近い面色より優先する。
			// 通常の孤立ノイズは coverage の下限で除外し、細線や輪郭だけを残す。
			if (
				featureDistance >= CONVERT_LIMITS.featureDistanceThreshold &&
				featureCoverage >= CONVERT_LIMITS.featureCoverageThreshold
			) {
				bestIndex = featureIndex;
			}
			output[target] = image.data[bestIndex];
			output[target + 1] = image.data[bestIndex + 1];
			output[target + 2] = image.data[bestIndex + 2];
			output[target + 3] = Math.round((alphaWeight / areaWeight) * 255);
		}
	}
	return { width, height, data: output };
};

export const selectConvertCandidate = (
	candidates: ConvertCandidate[],
	detailLevel: DetailLevel,
): ConvertCandidate => {
	const candidate = candidates.find((entry) => entry.label === detailLevel);
	if (candidate) return candidate;
	throw new Error(`Missing convert candidate: ${detailLevel}`);
};
