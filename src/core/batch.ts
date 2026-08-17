import type {
	DitherMode,
	ProcessedImageResult,
	ProcessingAnalysis,
	ProcessResult,
	RawImage,
	RGB,
} from "../shared/types";
import { withoutCompareImages } from "./compare-images";
import type { ProcessOptions } from "./processor";
import { processImage } from "./processor";
import { createSharedPalette } from "./shared-palette";

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

type BatchProcessSuccess = {
	id: string;
	status: "done";
	/**
	 * [Intended] 比較用の 2 枚は持たない。一括処理の結果は一覧と書き出しにしか使わず、
	 * 原寸の compareBefore を画像の枚数だけ抱えるとメモリだけを圧迫する。
	 */
	processResult: ProcessedImageResult;
};

type BatchProcessFailure = {
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
				? {
						...input.options,
						reduceColors: false,
						fixedPalette: undefined,
						outlineStyle: "none" as const,
					}
				: input.options;
			items.push({
				id: input.id,
				status: "done",
				processResult: withoutCompareImages(process(input.image, options)),
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
			// [Intended] 共通パレットは通常経路の減色段階で適用し、
			// 明示指定されたアウトライン色などの後処理を量子化しない。
			item.processResult = withoutCompareImages(
				process(
					inputs[index].image,
					sharedPalette.length === 0
						? inputs[index].options
						: {
								...inputs[index].options,
								reduceColors: true,
								fixedPalette: sharedPalette,
								colorCount: sharedPalette.length,
								ditherMode: batchOptions.ditherMode,
								ditherStrength: batchOptions.ditherStrength,
							},
				),
			);
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
