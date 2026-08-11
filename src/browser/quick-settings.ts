import type { ProcessOptions } from "../core/processor";
import { createDefaultProcessOptions } from "../core/processor-options";
import { PROCESS_DEFAULTS } from "../shared/config";
import type {
	BackgroundRemovalScope,
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
	bgRemovalScope: BackgroundRemovalScope;
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
	processingMode: PROCESS_DEFAULTS.processingMode,
	detailLevel: PROCESS_DEFAULTS.detailLevel,
	colors: "auto",
	background: "auto",
	bgRemovalScope: PROCESS_DEFAULTS.bgRemovalScope,
	dithering: "off",
	outlineStyle: PROCESS_DEFAULTS.outlineStyle,
	trimToContent: PROCESS_DEFAULTS.trimToContent,
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

/**
 * Auto 抽出では角シードが無く "selected" が "outer" と同じ結果になるため、
 * 実際に渡すオプションでは "outer" へ寄せる。
 *
 * [Intended] 色を指定する抽出も角シードは持たないが、"selected" では画像全体の
 * 一致画素からフラッドフィルするため内側の閉領域まで落ちる。"outer" とは結果が
 * 異なるので寄せない。
 */
const resolveBgRemovalScope = (
	scope: BackgroundRemovalScope,
	method: NonNullable<ProcessOptions["bgExtractionMethod"]>,
): BackgroundRemovalScope =>
	scope === "selected" && method === "auto" ? "outer" : scope;

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
		options.bgRemovalScope = resolveBgRemovalScope(
			quick.bgRemovalScope,
			"auto",
		);
		options.preRemoveBackground = true;
		options.postRemoveBackground = true;
	} else if (quick.background === "pick") {
		options.bgExtractionMethod = "rgb";
		options.bgRemovalScope = resolveBgRemovalScope(quick.bgRemovalScope, "rgb");
		options.preRemoveBackground = true;
		options.postRemoveBackground = true;
	} else if (options.bgExtractionMethod !== "none") {
		// 背景が custom（詳細設定の抽出方法を使う）でも、範囲はかんたん設定が持つ。
		options.bgRemovalScope = resolveBgRemovalScope(
			quick.bgRemovalScope,
			options.bgExtractionMethod ?? PROCESS_DEFAULTS.bgExtractionMethod,
		);
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

/**
 * UI の初期状態（詳細設定の既定値と Auto プリセット）を処理オプションへ変換する。
 *
 * [Intended] UI に表示していない詳細設定も既定値から取り込むため、DOM の
 * 初期化経路と同じ設定になる。Auto 品質ケースもこの関数を使って同じ状態を測る。
 */
export const createUiInitialProcessOptions = (): ProcessOptions =>
	applyQuickSettingsToOptions(
		createDefaultProcessOptions(),
		QUICK_SETTINGS_DEFAULTS,
	);
