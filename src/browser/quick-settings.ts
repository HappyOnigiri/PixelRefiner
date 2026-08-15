import type { ProcessOptions } from "../core/processor";
import { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS } from "../shared/config";
import type { DetailLevel, ProcessingMode } from "../shared/types";

export type QuickReductionMode =
	| "auto"
	| "none"
	| "8"
	| "16"
	| "24"
	| "32"
	| "mono"
	| "gb_legacy"
	| "gb_pocket"
	| "gb_light"
	| "pico8"
	| "nes"
	| "pc98"
	| "msx"
	| "c64"
	| "arne16"
	| "sfc_sprite"
	| "sfc_bg";
export type QuickBackground = "keep" | "auto" | "pick";
export type QuickDithering = "off" | "subtle" | "strong";

export type QuickSettingsState = {
	processingMode: ProcessingMode;
	detailLevel: DetailLevel;
	reductionMode: QuickReductionMode;
	background: QuickBackground;
	dithering: QuickDithering;
	backgroundColor?: string;
};

export type BuiltInPreset = {
	id: string;
	labelKey: string;
	quickSettings: QuickSettingsState;
};

export const QUICK_SETTINGS_DEFAULTS: QuickSettingsState = {
	processingMode: PROCESS_DEFAULTS.processingMode,
	detailLevel: PROCESS_DEFAULTS.detailLevel,
	reductionMode: "auto",
	background: "auto",
	dithering: "off",
};

/**
 * かんたん設定だけから処理オプションを作る。
 * [Intended] 詳細設定を土台にしないことで、非表示タブの値が混入しないようにする。
 */
export const createQuickProcessOptions = (
	quick: QuickSettingsState,
): ProcessOptions => {
	const fixedColorCount =
		quick.reductionMode === "8" ||
		quick.reductionMode === "16" ||
		quick.reductionMode === "24" ||
		quick.reductionMode === "32"
			? Number(quick.reductionMode)
			: undefined;
	const options: ProcessOptions = {
		...createDefaultProcessOptions(),
		processingMode: quick.processingMode,
		detailLevel: quick.detailLevel,
		outlineStyle: PROCESS_DEFAULTS.outlineStyle,
		// [Policy] 背景を残す出力はキャンバス全体を維持し、背景を透過する出力だけを内容範囲へ詰める。
		trimToContent: quick.background !== "keep",
		preserveProcessingScale: true,
		fixedPalette: undefined,
	};
	if (quick.reductionMode === "auto") {
		// [Policy] 仕上がりが Convert なら公開選択肢の「24色」、それ以外なら
		// 「元の色を維持」を選ぶ。core の経路既定へ委ねるため指定自体を外す。
		delete options.reduceColors;
		delete options.reduceColorMode;
		delete options.colorCount;
	} else {
		options.reduceColors = quick.reductionMode !== "none";
		options.reduceColorMode =
			fixedColorCount === undefined ? quick.reductionMode : "auto";
		options.colorCount = fixedColorCount ?? PROCESS_DEFAULTS.colorCount;
	}

	if (quick.background === "keep") {
		options.bgExtractionMethod = "none";
		options.bgRemovalScope = "off";
		options.preRemoveBackground = false;
		options.postRemoveBackground = false;
	} else {
		const method = quick.background === "auto" ? "auto" : "rgb";
		options.bgExtractionMethod = method;
		options.bgRemovalScope = PROCESS_DEFAULTS.bgRemovalScope;
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

const presetQuickSettings = (
	quick: Partial<QuickSettingsState>,
): QuickSettingsState => ({ ...QUICK_SETTINGS_DEFAULTS, ...quick });

export const BUILT_IN_PRESETS: readonly BuiltInPreset[] = [
	{
		id: "auto",
		labelKey: "preset.auto",
		quickSettings: presetQuickSettings({}),
	},
	{
		id: "crisp-sprite",
		labelKey: "preset.crisp_sprite",
		quickSettings: presetQuickSettings({ processingMode: "refine" }),
	},
	{
		id: "keep-fine-details",
		labelKey: "preset.keep_fine_details",
		quickSettings: presetQuickSettings({ processingMode: "preserve" }),
	},
	{
		id: "transparent-icon",
		labelKey: "preset.transparent_icon",
		quickSettings: presetQuickSettings({ reductionMode: "32" }),
	},
	{
		id: "limited-colors",
		labelKey: "preset.limited_colors",
		quickSettings: presetQuickSettings({
			reductionMode: "16",
			dithering: "subtle",
		}),
	},
	{
		id: "photo-to-pixel",
		labelKey: "preset.photo_to_pixel",
		quickSettings: presetQuickSettings({ processingMode: "convert" }),
	},
] as const;

export const createBuiltInPresetOptions = (
	presetId: string,
): ProcessOptions => {
	const preset = BUILT_IN_PRESETS.find((entry) => entry.id === presetId);
	return createQuickProcessOptions(
		(preset ?? BUILT_IN_PRESETS[0]).quickSettings,
	);
};

/** UI 初期状態と品質テストで共有するAutoプリセット。 */
export const createUiInitialProcessOptions = (): ProcessOptions =>
	createBuiltInPresetOptions("auto");
