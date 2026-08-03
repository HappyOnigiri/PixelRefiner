import type { ProcessOptions } from "../core/processor";
import type {
	DetailLevel,
	OutlineStyle,
	ProcessingMode,
} from "../shared/types";

export type QuickColors = "auto" | "16" | "32" | "64" | "custom";
export type QuickBackground = "keep" | "auto" | "pick" | "custom";
export type QuickDithering = "off" | "subtle" | "strong" | "custom";

export type QuickSettingsState = {
	processingMode: ProcessingMode;
	detailLevel: DetailLevel;
	colors: QuickColors;
	background: QuickBackground;
	dithering: QuickDithering;
	outlineStyle: OutlineStyle;
	trimToContent: boolean;
};

export type BuiltInPreset = {
	id: string;
	labelKey: string;
	settings: QuickSettingsState;
};

export const QUICK_SETTINGS_DEFAULTS: QuickSettingsState = {
	processingMode: "auto",
	detailLevel: "balanced",
	colors: "auto",
	background: "auto",
	dithering: "off",
	outlineStyle: "none",
	trimToContent: true,
};

export const BUILT_IN_PRESETS: readonly BuiltInPreset[] = [
	{
		id: "auto",
		labelKey: "preset.auto",
		settings: { ...QUICK_SETTINGS_DEFAULTS },
	},
	{
		id: "crisp-sprite",
		labelKey: "preset.crisp_sprite",
		settings: {
			...QUICK_SETTINGS_DEFAULTS,
			processingMode: "refine",
		},
	},
	{
		id: "keep-fine-details",
		labelKey: "preset.keep_fine_details",
		settings: {
			...QUICK_SETTINGS_DEFAULTS,
			detailLevel: "detailed",
		},
	},
	{
		id: "transparent-icon",
		labelKey: "preset.transparent_icon",
		settings: {
			...QUICK_SETTINGS_DEFAULTS,
			colors: "32",
			outlineStyle: "rounded",
		},
	},
	{
		id: "limited-colors",
		labelKey: "preset.limited_colors",
		settings: {
			...QUICK_SETTINGS_DEFAULTS,
			colors: "16",
			dithering: "subtle",
		},
	},
	{
		id: "photo-to-pixel",
		labelKey: "preset.photo_to_pixel",
		settings: {
			...QUICK_SETTINGS_DEFAULTS,
			processingMode: "convert",
			colors: "32",
			background: "keep",
			dithering: "subtle",
		},
	},
] as const;

export const applyQuickSettingsToOptions = (
	advanced: ProcessOptions,
	quick: QuickSettingsState,
): ProcessOptions => {
	const options: ProcessOptions = {
		...advanced,
		processingMode: quick.processingMode,
		detailLevel: quick.detailLevel,
		outlineStyle: quick.outlineStyle,
		trimToContent: quick.trimToContent,
	};

	if (quick.colors === "auto") {
		delete options.reduceColors;
		delete options.reduceColorMode;
		delete options.colorCount;
	} else if (quick.colors !== "custom") {
		options.reduceColors = true;
		options.reduceColorMode = "auto";
		options.colorCount = Number(quick.colors);
	}

	if (quick.background === "keep") {
		options.bgExtractionMethod = "none";
		options.bgRemovalScope = "off";
		options.preRemoveBackground = false;
		options.postRemoveBackground = false;
	} else if (quick.background === "auto") {
		options.bgExtractionMethod = "auto";
		options.bgRemovalScope = "outer";
		options.preRemoveBackground = true;
		options.postRemoveBackground = true;
	} else if (quick.background === "pick") {
		options.bgExtractionMethod = "rgb";
		options.bgRemovalScope = "outer";
		options.preRemoveBackground = true;
		options.postRemoveBackground = true;
	}

	if (quick.dithering === "off") {
		options.ditherMode = "none";
		options.ditherStrength = 0;
	} else if (quick.dithering === "subtle") {
		options.ditherMode = "ordered";
		options.ditherStrength = 20;
	} else if (quick.dithering === "strong") {
		options.ditherMode = "floyd-steinberg";
		options.ditherStrength = 60;
	}

	return options;
};
