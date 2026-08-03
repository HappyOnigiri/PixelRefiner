import {
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

const entropyFromHistogram = (
	histogram: Uint32Array,
	sampleCount: number,
): number => {
	if (sampleCount === 0) return 0;
	let entropy = 0;
	let occupied = 0;
	for (let i = 0; i < histogram.length; i += 1) {
		const count = histogram[i];
		if (count === 0) continue;
		occupied += 1;
		const probability = count / sampleCount;
		entropy -= probability * Math.log2(probability);
	}
	return occupied <= 1 ? 0 : clampUnit(entropy / Math.log2(occupied));
};

const imageFeatures = (
	image: RawImage,
): Omit<ClassificationFeatures, "gridConfidence" | "gridScale"> => {
	const pixelCount = image.width * image.height;
	if (pixelCount === 0) {
		return {
			uniqueColorRatio: 0,
			colorEntropy: 0,
			flatNeighborRatio: 0,
			smoothGradientRatio: 0,
			alphaLevelRatio: 0,
			visiblePixelRatio: 0,
		};
	}
	const stride = Math.max(
		1,
		Math.ceil(
			Math.sqrt(pixelCount / INPUT_CLASSIFIER_THRESHOLDS.maxSamplePixels),
		),
	);
	const colorHistogram = new Uint32Array(4096);
	const luminanceHistogram = new Uint32Array(32);
	const alphaHistogram = new Uint32Array(16);
	let samples = 0;
	let visibleSamples = 0;
	let neighborSamples = 0;
	let flatNeighbors = 0;
	let smoothGradients = 0;
	for (let y = 0; y < image.height; y += stride) {
		for (let x = 0; x < image.width; x += stride) {
			const index = (y * image.width + x) * 4;
			const red = image.data[index];
			const green = image.data[index + 1];
			const blue = image.data[index + 2];
			const alpha = image.data[index + 3];
			if (alpha > 0) {
				const colorBucket =
					((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
				const luminance = (red * 54 + green * 183 + blue * 19) >> 8;
				colorHistogram[colorBucket] += 1;
				luminanceHistogram[luminance >> 3] += 1;
				visibleSamples += 1;
			}
			alphaHistogram[alpha >> 4] += 1;
			samples += 1;
			if (x + stride >= image.width) continue;
			const neighbor = (y * image.width + x + stride) * 4;
			const neighborAlpha = image.data[neighbor + 3];
			let difference = Math.abs(alpha - neighborAlpha);
			if (alpha > 0 && neighborAlpha > 0) {
				difference +=
					Math.abs(red - image.data[neighbor]) +
					Math.abs(green - image.data[neighbor + 1]) +
					Math.abs(blue - image.data[neighbor + 2]);
			}
			neighborSamples += 1;
			if (difference === 0) flatNeighbors += 1;
			if (difference > 0 && difference <= 96) smoothGradients += 1;
		}
	}
	let uniqueColors = 0;
	for (let i = 0; i < colorHistogram.length; i += 1) {
		if (colorHistogram[i] > 0) uniqueColors += 1;
	}
	let alphaLevels = 0;
	for (let i = 0; i < alphaHistogram.length; i += 1) {
		if (alphaHistogram[i] > 0) alphaLevels += 1;
	}
	return {
		uniqueColorRatio: uniqueColors / Math.max(1, visibleSamples),
		colorEntropy: entropyFromHistogram(luminanceHistogram, visibleSamples),
		flatNeighborRatio: flatNeighbors / Math.max(1, neighborSamples),
		smoothGradientRatio: smoothGradients / Math.max(1, neighborSamples),
		alphaLevelRatio: alphaLevels / alphaHistogram.length,
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
	if (
		image.width < limits.minDimension ||
		image.height < limits.minDimension ||
		image.data.length === 0 ||
		features.visiblePixelRatio === 0
	) {
		return result("uncertain", 1, features, "EMPTY_OR_TINY_INPUT");
	}
	if (
		Math.max(image.width, image.height) <= limits.nativeSafeMaxDimension &&
		features.uniqueColorRatio <= limits.nativeUniqueColorRatio
	) {
		return result("native-pixel", 0.85, features, "NATIVE_PIXEL_STRUCTURE");
	}
	const scaledStrength = Math.min(
		features.gridConfidence / limits.scaledGridConfidence,
		features.gridScale / limits.scaledMinGridScale,
		features.flatNeighborRatio / limits.scaledFlatNeighborRatio,
	);
	if (scaledStrength >= 1) {
		return result(
			"scaled-pixel",
			Math.min(0.99, 0.55 + (scaledStrength - 1) * 0.35),
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
			Math.min(0.98, 0.55 + (continuousStrength - 1) * 0.25),
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
			Math.min(0.95, 0.55 + (softStrength - 1) * 0.3),
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
			Math.min(0.95, 0.55 + (nativeStrength - 1) * 0.25),
			features,
			"NATIVE_PIXEL_STRUCTURE",
		);
	}
	return result(
		"uncertain",
		Math.max(0, limits.minimumDecisionConfidence - 0.05),
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

export const selectAutoProcessingRoute = (
	classification: InputClassification,
	candidates: GridCandidateReport[],
): { route: ProcessingRoute; fellBackToPreserve: boolean } => {
	const route = routeForClassification(classification);
	if (route !== "refine") return { route, fellBackToPreserve: false };
	const bestGridCandidate = candidates.find(
		(candidate) => candidate.method !== "preserve",
	);
	if (
		bestGridCandidate &&
		bestGridCandidate.confidence >=
			PROCESS_ANALYSIS_THRESHOLDS.gridCandidateConfidenceThreshold
	) {
		return { route, fellBackToPreserve: false };
	}
	return { route: "preserve", fellBackToPreserve: true };
};
