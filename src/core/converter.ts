import { CONVERT_CANDIDATE_DEFAULTS, CONVERT_LIMITS } from "../shared/config";
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
	for (let y = 0; y < height; y += stride) {
		for (let x = 0; x < width; x += stride) {
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
		const defaults = CONVERT_CANDIDATE_DEFAULTS[label];
		const shortSide = clamp(
			Math.round(balancedShort * defaults.scale),
			1,
			sourceShort,
		);
		return {
			label,
			...dimensionsForShortSide(image, shortSide),
			colorCount: defaults.colorCount,
			ditherStrength: defaults.ditherStrength,
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
	target[0] = 0.2104542553 * rootL + 0.793617785 * rootM - 0.0040720468 * rootS;
	target[1] = 1.9779984951 * rootL - 2.428592205 * rootM + 0.4505937099 * rootS;
	target[2] = 0.0259040371 * rootL + 0.7827717662 * rootM - 0.808675766 * rootS;
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
	const lab = new Float64Array(3);
	const scaleX = image.width / width;
	const scaleY = image.height / height;
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
					if (weightedVisible <= 0) continue;
					writeOklab(
						image.data[index],
						image.data[index + 1],
						image.data[index + 2],
						lab,
					);
					visibleWeight += weightedVisible;
					meanL += lab[0] * weightedVisible;
					meanA += lab[1] * weightedVisible;
					meanB += lab[2] * weightedVisible;
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
					if (image.data[index + 3] === 0) continue;
					writeOklab(
						image.data[index],
						image.data[index + 1],
						image.data[index + 2],
						lab,
					);
					const deltaL = lab[0] - meanL;
					const deltaA = lab[1] - meanA;
					const deltaB = lab[2] - meanB;
					const rawDistance =
						deltaL * deltaL + deltaA * deltaA + deltaB * deltaB;
					const distance = rawDistance / (1 + edges[pixel]);
					if (distance < bestDistance) {
						bestDistance = distance;
						bestIndex = index;
					}
					const overlapX =
						Math.min(sourceRight, x + 1) - Math.max(sourceLeft, x);
					const coverage = (overlapX * overlapY) / (scaleX * scaleY);
					if (rawDistance > featureDistance) {
						featureDistance = rawDistance;
						featureCoverage = coverage;
						featureIndex = index;
					}
				}
			}
			// [Intended] セル面積の一部を占める高コントラスト色は、平均色に近い面色より優先する。
			// 通常の孤立ノイズは coverage の下限で除外し、細線や輪郭だけを残す。
			if (featureDistance >= 0.0625 && featureCoverage >= 0.04) {
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
