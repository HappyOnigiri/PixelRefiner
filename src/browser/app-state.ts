import type { RGB } from "../shared/types";

export type ProcessingState = {
	currentFixedPalette?: RGB[];
	currentExtractedPalette: RGB[];
	compareBeforeOriginalUrl: string;
	compareBeforeSanitizedUrl: string;
	compareAfterUrl: string;
	compareBeforeMode: "original" | "sanitized";
};

export const createProcessingState = (): ProcessingState => ({
	currentExtractedPalette: [],
	compareBeforeOriginalUrl: "",
	compareBeforeSanitizedUrl: "",
	compareAfterUrl: "",
	compareBeforeMode: "original",
});
