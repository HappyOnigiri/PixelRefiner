import type {
	DitherMode,
	ProcessingAnalysis,
	ProcessResult,
	RawImage,
	RGB,
} from "../shared/types";
import { extractUsedColors } from "./color-reduction";
import type { ProcessOptions } from "./processor";
import { processImage } from "./processor";
import { applySharedPalette, createSharedPalette } from "./shared-palette";

export type BatchProcessInput = {
	id: string;
	image: RawImage;
	options: ProcessOptions;
};

export type BatchProcessingOptions = {
	sharedPalette: boolean;
	colorCount: number;
	ditherMode: DitherMode;
	ditherStrength: number;
};

export type BatchProcessSuccess = {
	id: string;
	status: "done";
	processResult: ProcessResult;
};

export type BatchProcessFailure = {
	id: string;
	status: "error";
	error: string;
};

export type BatchProcessItemResult = BatchProcessSuccess | BatchProcessFailure;

export type BatchProcessResult = {
	items: BatchProcessItemResult[];
	sharedPalette?: RGB[];
};

export type BatchImageProcessor = (
	image: RawImage,
	options: ProcessOptions,
) => ProcessResult;

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export const needsBatchAttention = (analysis: ProcessingAnalysis): boolean =>
	analysis.warnings.includes("LOW_GRID_CONFIDENCE") ||
	analysis.classificationReasons?.includes("LOW_CLASSIFICATION_CONFIDENCE") ===
		true;

export const processBatchImages = (
	inputs: readonly BatchProcessInput[],
	batchOptions: BatchProcessingOptions,
	process: BatchImageProcessor = processImage,
): BatchProcessResult => {
	const items: BatchProcessItemResult[] = [];
	for (let index = 0; index < inputs.length; index += 1) {
		const input = inputs[index];
		try {
			const options = batchOptions.sharedPalette
				? { ...input.options, reduceColors: false, fixedPalette: undefined }
				: input.options;
			items.push({
				id: input.id,
				status: "done",
				processResult: process(input.image, options),
			});
		} catch (error) {
			items.push({ id: input.id, status: "error", error: errorMessage(error) });
		}
	}

	if (!batchOptions.sharedPalette) return { items };
	const successful = items.filter(
		(item): item is BatchProcessSuccess => item.status === "done",
	);
	const sharedPalette = createSharedPalette(
		successful.map((item) => item.processResult.result),
		batchOptions.colorCount,
	);
	for (let index = 0; index < items.length; index += 1) {
		const item = items[index];
		if (item.status !== "done") continue;
		try {
			const result = applySharedPalette(
				item.processResult.result,
				sharedPalette,
				batchOptions.ditherMode,
				batchOptions.ditherStrength,
			);
			item.processResult = {
				...item.processResult,
				result,
				extractedPalette: extractUsedColors(result),
			};
		} catch (error) {
			items[index] = {
				id: item.id,
				status: "error",
				error: errorMessage(error),
			};
		}
	}
	return { items, sharedPalette };
};
