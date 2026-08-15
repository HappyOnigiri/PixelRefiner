import type { ProcessOptions } from "../core/processor";
import { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS } from "../shared/config";
import type {
	DetailLevel,
	ProcessingMode,
	ProcessingRoute,
} from "../shared/types";

export type QuickReductionMode =
	| "none"
	| "8"
	| "16"
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
	options: ProcessOptions;
};

export const QUICK_SETTINGS_DEFAULTS: QuickSettingsState = {
	processingMode: PROCESS_DEFAULTS.processingMode,
	detailLevel: PROCESS_DEFAULTS.detailLevel,
	reductionMode: "none",
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
		reduceColors: quick.reductionMode !== "none",
		reduceColorMode:
			fixedColorCount === undefined ? quick.reductionMode : "auto",
		colorCount: fixedColorCount ?? PROCESS_DEFAULTS.colorCount,
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

const presetOptions = (
	quick: Partial<QuickSettingsState>,
	overrides: ProcessOptions = {},
): ProcessOptions => ({
	...createQuickProcessOptions({ ...QUICK_SETTINGS_DEFAULTS, ...quick }),
	...overrides,
});

/**
 * 減色の指定を取り除き、処理経路の既定に委ねる。
 *
 * [Intended] かんたん設定の減色モード「なし」は減色しないという明示的な指定なので、
 * そのまま渡すと経路任せの Auto と結果が変わる。経路へ委ねるには指定自体を落とす必要がある。
 */
const withRouteManagedReduction = (options: ProcessOptions): ProcessOptions => {
	const next = { ...options };
	delete next.reduceColors;
	delete next.reduceColorMode;
	delete next.colorCount;
	return next;
};

const AUTO_PRESET_OPTIONS = withRouteManagedReduction(presetOptions({}));

/**
 * おまかせが選ぶ各経路を、同じ共通設定のまま手動で再現する。
 *
 * [Intended] Auto のときだけ有効になる補助判定は、経路を固定すると既定の "auto" では
 * 無効になる。プリセットでは明示的に有効化し、経路選択後の処理条件を揃える。
 */
const autoRoutePresetOptions = (
	processingMode: ProcessingRoute,
): ProcessOptions => ({
	...AUTO_PRESET_OPTIONS,
	processingMode,
	smallAspectGridAlignment: "on",
	watermarkSamplingCompat: "on",
});

export const BUILT_IN_PRESETS: readonly BuiltInPreset[] = [
	{
		id: "auto",
		labelKey: "preset.auto",
		options: AUTO_PRESET_OPTIONS,
	},
	{
		id: "crisp-sprite",
		labelKey: "preset.crisp_sprite",
		options: autoRoutePresetOptions("refine"),
	},
	{
		id: "keep-fine-details",
		labelKey: "preset.keep_fine_details",
		options: autoRoutePresetOptions("preserve"),
	},
	{
		id: "transparent-icon",
		labelKey: "preset.transparent_icon",
		options: presetOptions(
			{},
			{
				reduceColors: true,
				reduceColorMode: "auto",
				colorCount: 32,
				outlineStyle: "rounded",
			},
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
		options: autoRoutePresetOptions("convert"),
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
