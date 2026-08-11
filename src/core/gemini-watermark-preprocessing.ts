import type { PixelGrid, ProcessResult, RawImage } from "../shared/types";
import type { AutomaticBackgroundResult, BackgroundModel } from "./background";
import { getBackgroundTargets, removeBackground } from "./background-removal";
import {
	applyGeminiWatermarkRemoval,
	clearGeminiWatermarkFromWorkingImage,
	createGeminiWatermarkDetectionMask,
	detectGeminiWatermark,
} from "./gemini-watermark";
import { downsample } from "./image-operations";
import {
	getDownsampleOptions,
	type NormalizedProcessOptions,
} from "./processor-options";

type PrepareGeminiWatermarkGeometryInput = {
	inputImage: RawImage;
	image: RawImage;
	working: RawImage;
	options: NormalizedProcessOptions;
	automaticBackground?: AutomaticBackgroundResult;
	getBackgroundMaskedInput: () => RawImage;
	backgroundTargets: Array<[number, number, number]>;
	backgroundModel?: BackgroundModel;
};

export type PreparedGeminiWatermarkGeometry = {
	image: RawImage;
	working: RawImage;
	mask?: RawImage;
	removed: boolean;
	finish: (processed: ProcessResult) => ProcessResult;
};

const createGeminiWatermarkFinisher = (
	removal: ReturnType<typeof detectGeminiWatermark>,
	detection: ReturnType<typeof createGeminiWatermarkDetectionMask>,
	options: NormalizedProcessOptions,
): ((processed: ProcessResult) => ProcessResult) =>
	removal.removed
		? (processed) =>
				applyGeminiWatermarkRemoval(
					removal,
					detection.image,
					processed,
					options,
					detection.mode,
				)
		: (processed) => processed;

/** 透かし除外後のセル境界では、アルファ優先サンプルによる末尾行の欠落を防ぐ。 */
export const getGeminiWatermarkDownsampleOptions = (
	options: NormalizedProcessOptions,
	removed: boolean,
): ReturnType<typeof getDownsampleOptions> =>
	getDownsampleOptions(
		removed && options.processingMode === "auto"
			? { ...options, cellSamplingMode: "legacy-median" }
			: options,
	);

export const downsampleGeminiWatermarkGeometry = (
	preparedMask: RawImage | undefined,
	geometryWorking: RawImage,
	working: RawImage,
	downsampledWorking: RawImage,
	grid: PixelGrid,
	options: ReturnType<typeof getDownsampleOptions>,
): RawImage => {
	if (preparedMask) return downsample(preparedMask, grid, options);
	return geometryWorking === working
		? downsampledWorking
		: downsample(geometryWorking, grid, options);
};

type PrepareGeminiWatermarkAwareAutoMaskInput = {
	needed: boolean;
	preparedMask?: RawImage;
	options: NormalizedProcessOptions;
	geometryWorking: RawImage;
	backgroundTargets: Array<[number, number, number]>;
	backgroundModel?: BackgroundModel;
};

export const prepareGeminiWatermarkAwareAutoMask = (
	input: PrepareGeminiWatermarkAwareAutoMaskInput,
): RawImage | null => {
	if (!input.needed) return null;
	if (input.preparedMask) return input.preparedMask;
	return removeBackground(
		input.geometryWorking,
		input.options.backgroundTolerance,
		input.options.bgRemovalScope,
		input.options.bgConnectivity,
		input.backgroundTargets,
		input.options.bgExtractionMethod,
		input.backgroundModel,
	);
};

/** 透かしを Auto の格子・トリミング判定だけから除外した画像とマスクを準備する。 */
export const prepareGeminiWatermarkGeometry = (
	input: PrepareGeminiWatermarkGeometryInput,
): PreparedGeminiWatermarkGeometry => {
	if (input.options.geminiWatermarkRemoval === "off") {
		return {
			image: input.image,
			working: input.working,
			removed: false,
			finish: (processed) => processed,
		};
	}
	const detection = createGeminiWatermarkDetectionMask(
		input.inputImage,
		input.options,
		input.automaticBackground,
		input.getBackgroundMaskedInput,
	);
	const removal = detectGeminiWatermark(input.inputImage, detection.image);
	const image = clearGeminiWatermarkFromWorkingImage(
		detection.image,
		input.image,
		removal.pixels,
		detection.mode,
	);
	const working = clearGeminiWatermarkFromWorkingImage(
		detection.image,
		input.working,
		removal.pixels,
		detection.mode,
	);
	const removed = working !== input.working;
	const finish = createGeminiWatermarkFinisher(
		removal,
		detection,
		input.options,
	);
	if (!removed) return { image, working, removed, finish };

	// [Intended] Auto 背景モデルの柔らかい外縁を再利用すると、消した透かしの位置だけでなく
	// 被写体境界まで広がった BBox が残るため、検出済み画像では角連結の背景を幾何基準にする。
	const backgroundMethod =
		input.options.bgExtractionMethod === "auto"
			? ("top-left" as const)
			: input.options.bgExtractionMethod;
	const backgroundTargets =
		backgroundMethod === input.options.bgExtractionMethod
			? input.backgroundTargets
			: getBackgroundTargets(image, backgroundMethod, input.options.bgRgb, 16);
	const mask = removeBackground(
		image,
		input.options.backgroundTolerance,
		input.options.bgRemovalScope,
		input.options.bgConnectivity,
		backgroundTargets,
		backgroundMethod,
		input.backgroundModel,
	);
	return { image, working, mask, removed, finish };
};
