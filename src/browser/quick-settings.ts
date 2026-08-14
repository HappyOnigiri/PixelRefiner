import type { ProcessOptions } from "../core/processor";
import { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS } from "../shared/config";
import type {
	BackgroundRemovalScope,
	DetailLevel,
	OutlineStyle,
	ProcessingMode,
} from "../shared/types";

export type QuickReductionMode =
	| "none"
	| "mono"
	| "gb_legacy"
	| "gb_pocket"
	| "gb_light"
	| "pico8"
	| "nes"
	| "pc98"
	| "msx"
	| "c64"
	| "arne16";
export type QuickBackground = "keep" | "auto" | "pick";
export type QuickDithering = "off" | "subtle" | "strong";

export type QuickSettingsState = {
	processingMode: ProcessingMode;
	detailLevel: DetailLevel;
	reductionMode: QuickReductionMode;
	background: QuickBackground;
	bgRemovalScope: BackgroundRemovalScope;
	dithering: QuickDithering;
	outlineStyle: OutlineStyle;
	trimToContent: boolean;
	backgroundColor?: string;
};

export type BuiltInPreset = {
	id: string;
	labelKey: string;
	options: ProcessOptions;
};

export const QUICK_SETTINGS_DEFAULTS: QuickSettingsState = {
	processingMode: PROCESS_DEFAULTS.processingMode,
	detailLevel: PROCESS_DEFAULTS.detailLevel,
	reductionMode: "none",
	background: "auto",
	bgRemovalScope: PROCESS_DEFAULTS.bgRemovalScope,
	dithering: "off",
	outlineStyle: PROCESS_DEFAULTS.outlineStyle,
	trimToContent: PROCESS_DEFAULTS.trimToContent,
};

/** Auto 抽出で意味を持たない角シード限定を、等価な外周指定へ寄せる。 */
const resolveBgRemovalScope = (
	scope: BackgroundRemovalScope,
	method: NonNullable<ProcessOptions["bgExtractionMethod"]>,
): BackgroundRemovalScope =>
	scope === "selected" && method === "auto" ? "outer" : scope;

/**
 * かんたん設定だけから処理オプションを作る。
 * [Intended] 詳細設定を土台にしないことで、非表示タブの値が混入しないようにする。
 */
export const createQuickProcessOptions = (
	quick: QuickSettingsState,
): ProcessOptions => {
	const options: ProcessOptions = {
		...createDefaultProcessOptions(),
		processingMode: quick.processingMode,
		detailLevel: quick.detailLevel,
		outlineStyle: quick.outlineStyle,
		trimToContent: quick.trimToContent,
		reduceColors: quick.reductionMode !== "none",
		reduceColorMode: quick.reductionMode,
		fixedPalette: undefined,
	};

	if (quick.background === "keep") {
		options.bgExtractionMethod = "none";
		options.bgRemovalScope = "off";
		options.preRemoveBackground = false;
		options.postRemoveBackground = false;
	} else {
		const method = quick.background === "auto" ? "auto" : "rgb";
		options.bgExtractionMethod = method;
		options.bgRemovalScope = resolveBgRemovalScope(
			quick.bgRemovalScope,
			method,
		);
		options.preRemoveBackground = true;
		options.postRemoveBackground = true;
		if (method === "rgb") options.bgRgb = quick.backgroundColor;
	}

	if (quick.dithering === "off") {
		options.ditherMode = "none";
		options.ditherStrength = 0;
	} else if (quick.dithering === "subtle") {
		options.ditherMode = "ordered";
		options.ditherStrength = 20;
	} else {
		options.ditherMode = "floyd-steinberg";
		options.ditherStrength = 60;
	}

	return options;
};

const presetOptions = (
	quick: Partial<QuickSettingsState>,
	overrides: ProcessOptions = {},
): ProcessOptions => ({
	...createQuickProcessOptions({ ...QUICK_SETTINGS_DEFAULTS, ...quick }),
	...overrides,
});

export const BUILT_IN_PRESETS: readonly BuiltInPreset[] = [
	{
		id: "auto",
		labelKey: "preset.auto",
		options: presetOptions({}),
	},
	{
		id: "crisp-sprite",
		labelKey: "preset.crisp_sprite",
		options: presetOptions({ processingMode: "refine" }),
	},
	{
		id: "keep-fine-details",
		labelKey: "preset.keep_fine_details",
		options: presetOptions({ detailLevel: "detailed" }),
	},
	{
		id: "transparent-icon",
		labelKey: "preset.transparent_icon",
		options: presetOptions(
			{ outlineStyle: "rounded" },
			{ reduceColors: true, reduceColorMode: "auto", colorCount: 32 },
		),
	},
	{
		id: "limited-colors",
		labelKey: "preset.limited_colors",
		options: presetOptions(
			{ dithering: "subtle" },
			{ reduceColors: true, reduceColorMode: "auto", colorCount: 16 },
		),
	},
	{
		id: "photo-to-pixel",
		labelKey: "preset.photo_to_pixel",
		options: presetOptions(
			{
				processingMode: "convert",
				background: "keep",
				dithering: "subtle",
			},
			{ reduceColors: true, reduceColorMode: "auto", colorCount: 32 },
		),
	},
] as const;

export const createBuiltInPresetOptions = (
	presetId: string,
): ProcessOptions => {
	const preset = BUILT_IN_PRESETS.find((entry) => entry.id === presetId);
	return { ...(preset ?? BUILT_IN_PRESETS[0]).options };
};

/** UI 初期状態と品質テストで共有するAutoプリセット。 */
export const createUiInitialProcessOptions = (): ProcessOptions =>
	createBuiltInPresetOptions("auto");
