import type { RGB } from "../shared/types";

export type SettingsMode = "preset" | "quick" | "advanced";

export type ProcessingState = {
	settingsMode: SettingsMode;
	selectedBuiltInPresetId: string;
	currentFixedPalette?: RGB[];
	currentExtractedPalette: RGB[];
	compareBeforeOriginalUrl: string;
	compareBeforeSanitizedUrl: string;
	compareAfterUrl: string;
	compareBeforeMode: "original" | "sanitized";
};

export const createProcessingState = (): ProcessingState => ({
	settingsMode: "preset",
	selectedBuiltInPresetId: "auto",
	currentExtractedPalette: [],
	compareBeforeOriginalUrl: "",
	compareBeforeSanitizedUrl: "",
	compareAfterUrl: "",
	compareBeforeMode: "original",
});
