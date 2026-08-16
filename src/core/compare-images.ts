import type {
	CompareImages,
	ProcessedImageResult,
	ProcessResult,
} from "../shared/types";

/** 比較用の 2 枚を落として結果本体だけにする。 */
export const withoutCompareImages = ({
	result,
	grid,
	extractedPalette,
	analysis,
}: ProcessResult): ProcessedImageResult => ({
	result,
	grid,
	extractedPalette,
	analysis,
});

/** 比較用の 2 枚だけを取り出す。 */
export const compareImagesOf = ({
	compareBefore,
	compareBeforeSanitized,
}: ProcessResult): CompareImages => ({ compareBefore, compareBeforeSanitized });
