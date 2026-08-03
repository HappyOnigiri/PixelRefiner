import {
	INPUT_CLASSIFIER_CONFIDENCE,
	INPUT_CLASSIFIER_THRESHOLDS,
	PROCESS_ANALYSIS_THRESHOLDS,
} from "../shared/config";
import type {
	ClassificationFeatures,
	GridCandidateReport,
	InputClassification,
	InputClassificationResult,
	ProcessingRoute,
	RawImage,
} from "../shared/types";

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

// 2 画素間の差。アルファ差に加え、両方が可視なら RGB 差も足す。
const pixelDifference = (
	data: Uint8ClampedArray,
	index: number,
	neighbor: number,
): number => {
	const alpha = data[index + 3];
	const neighborAlpha = data[neighbor + 3];
	let difference = Math.abs(alpha - neighborAlpha);
	if (alpha > 0 && neighborAlpha > 0) {
		difference +=
			Math.abs(data[index] - data[neighbor]) +
			Math.abs(data[index + 1] - data[neighbor + 1]) +
			Math.abs(data[index + 2] - data[neighbor + 2]);
	}
	return difference;
};

const imageFeatures = (
	image: RawImage,
): Omit<ClassificationFeatures, "gridConfidence" | "gridScale"> => {
	const pixelCount = image.width * image.height;
	if (pixelCount === 0) {
		return {
			uniqueColorRatio: 0,
			flatNeighborRatio: 0,
			smoothGradientRatio: 0,
			visiblePixelRatio: 0,
		};
	}
	const stride = Math.max(
		1,
		Math.ceil(
			Math.sqrt(pixelCount / INPUT_CLASSIFIER_THRESHOLDS.maxSamplePixels),
		),
	);
	const smoothMax = INPUT_CLASSIFIER_THRESHOLDS.smoothGradientMaxDifference;
	const colorHistogram = new Uint32Array(4096);
	let samples = 0;
	let visibleSamples = 0;
	let neighborSamples = 0;
	let flatNeighbors = 0;
	let smoothGradients = 0;
	for (let y = 0; y < image.height; y += stride) {
		for (let x = 0; x < image.width; x += stride) {
			const index = (y * image.width + x) * 4;
			if (image.data[index + 3] > 0) {
				const colorBucket =
					((image.data[index] >> 4) << 8) |
					((image.data[index + 1] >> 4) << 4) |
					(image.data[index + 2] >> 4);
				colorHistogram[colorBucket] += 1;
				visibleSamples += 1;
			}
			samples += 1;
			// [Intended] 横方向と縦方向を同じ基準で数える。片方だけだと、
			// 行内が同色で列方向にだけ変化する画像とその回転画像で分類が食い違う。
			if (x + stride < image.width) {
				const difference = pixelDifference(
					image.data,
					index,
					(y * image.width + x + stride) * 4,
				);
				neighborSamples += 1;
				if (difference === 0) flatNeighbors += 1;
				else if (difference <= smoothMax) smoothGradients += 1;
			}
			if (y + stride < image.height) {
				const difference = pixelDifference(
					image.data,
					index,
					((y + stride) * image.width + x) * 4,
				);
				neighborSamples += 1;
				if (difference === 0) flatNeighbors += 1;
				else if (difference <= smoothMax) smoothGradients += 1;
			}
		}
	}
	let uniqueColors = 0;
	for (let i = 0; i < colorHistogram.length; i += 1) {
		if (colorHistogram[i] > 0) uniqueColors += 1;
	}
	return {
		uniqueColorRatio: uniqueColors / Math.max(1, visibleSamples),
		flatNeighborRatio: flatNeighbors / Math.max(1, neighborSamples),
		smoothGradientRatio: smoothGradients / Math.max(1, neighborSamples),
		visiblePixelRatio: visibleSamples / Math.max(1, samples),
	};
};

const bestGridFeatures = (
	candidates: GridCandidateReport[],
): Pick<ClassificationFeatures, "gridConfidence" | "gridScale"> => {
	for (let i = 0; i < candidates.length; i += 1) {
		const candidate = candidates[i];
		if (candidate.method === "preserve") continue;
		return {
			gridConfidence: candidate.confidence,
			gridScale: Math.sqrt(candidate.grid.cellW * candidate.grid.cellH),
		};
	}
	return { gridConfidence: 0, gridScale: 1 };
};

const result = (
	classification: InputClassification,
	confidence: number,
	features: ClassificationFeatures,
	reason: InputClassificationResult["reasons"][number],
): InputClassificationResult => ({
	classification,
	confidence: clampUnit(confidence),
	features,
	reasons: [reason],
});

export const classifyInput = (
	image: RawImage,
	candidates: GridCandidateReport[] = [],
): InputClassificationResult => {
	const features = { ...imageFeatures(image), ...bestGridFeatures(candidates) };
	const limits = INPUT_CLASSIFIER_THRESHOLDS;
	const levels = INPUT_CLASSIFIER_CONFIDENCE;
	if (
		image.width < limits.minDimension ||
		image.height < limits.minDimension ||
		image.data.length === 0 ||
		features.visiblePixelRatio === 0
	) {
		return result(
			"uncertain",
			levels.emptyOrTiny,
			features,
			"EMPTY_OR_TINY_INPUT",
		);
	}
	if (
		Math.max(image.width, image.height) <= limits.nativeSafeMaxDimension &&
		features.uniqueColorRatio <= limits.nativeUniqueColorRatio
	) {
		return result(
			"native-pixel",
			levels.nativeSafe,
			features,
			"NATIVE_PIXEL_STRUCTURE",
		);
	}
	const scaledStrength = Math.min(
		features.gridConfidence / limits.scaledGridConfidence,
		features.gridScale / limits.scaledMinGridScale,
		features.flatNeighborRatio / limits.scaledFlatNeighborRatio,
	);
	if (scaledStrength >= 1) {
		return result(
			"scaled-pixel",
			Math.min(
				levels.scaledMax,
				levels.base + (scaledStrength - 1) * levels.scaledScale,
			),
			features,
			"INTEGER_GRID_STRUCTURE",
		);
	}
	const continuousStrength = Math.min(
		features.uniqueColorRatio / limits.continuousUniqueColorRatio,
		features.smoothGradientRatio / limits.continuousSmoothGradientRatio,
		limits.continuousFlatNeighborRatio /
			Math.max(features.flatNeighborRatio, 0.001),
	);
	if (continuousStrength >= 1) {
		return result(
			"continuous",
			Math.min(
				levels.continuousMax,
				levels.base + (continuousStrength - 1) * levels.continuousScale,
			),
			features,
			"CONTINUOUS_TONE_STRUCTURE",
		);
	}
	const softStrength = Math.min(
		features.gridConfidence / limits.softGridConfidence,
		features.gridScale / limits.softMinGridScale,
		features.smoothGradientRatio / limits.softSmoothGradientRatio,
	);
	if (softStrength >= 1) {
		return result(
			"soft-pixel",
			Math.min(
				levels.softMax,
				levels.base + (softStrength - 1) * levels.softScale,
			),
			features,
			"SOFT_GRID_STRUCTURE",
		);
	}
	const nativeStrength = Math.min(
		limits.nativeMaxDimension / Math.max(image.width, image.height),
		limits.nativeUniqueColorRatio / Math.max(features.uniqueColorRatio, 0.001),
		features.flatNeighborRatio / limits.nativeFlatNeighborRatio,
	);
	if (nativeStrength >= 1) {
		return result(
			"native-pixel",
			Math.min(
				levels.nativeMax,
				levels.base + (nativeStrength - 1) * levels.nativeScale,
			),
			features,
			"NATIVE_PIXEL_STRUCTURE",
		);
	}
	return result(
		"uncertain",
		levels.uncertain,
		features,
		"LOW_CLASSIFICATION_CONFIDENCE",
	);
};

export const routeForClassification = (
	classification: InputClassification,
): ProcessingRoute => {
	if (classification === "scaled-pixel" || classification === "soft-pixel") {
		return "refine";
	}
	if (classification === "continuous") return "convert";
	return "preserve";
};

// [Intended] 判定に使うのは「実際にダウンサンプリングへ適用されるグリッド」の信頼度であり、
// 候補リストの最上位ではない。候補は総合スコア順で、適用グリッドが先頭とは限らないため。
export const selectAutoProcessingRoute = (
	classification: InputClassification,
	selectedGridConfidence: number | undefined,
): { route: ProcessingRoute; fellBackToPreserve: boolean } => {
	const route = routeForClassification(classification);
	if (route !== "refine") return { route, fellBackToPreserve: false };
	if (
		selectedGridConfidence !== undefined &&
		selectedGridConfidence >=
			PROCESS_ANALYSIS_THRESHOLDS.gridCandidateConfidenceThreshold
	) {
		return { route, fellBackToPreserve: false };
	}
	return { route: "preserve", fellBackToPreserve: true };
};
