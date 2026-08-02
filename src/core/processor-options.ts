import {
	clampInt,
	clampOptionalInt,
	GRID_SIGNAL_DEFAULTS,
	PROCESS_DEFAULTS,
	PROCESS_RANGES,
} from "../shared/config";
import type {
	BackgroundRemovalScope,
	Connectivity,
	DitherMode,
	GridSignalOptions,
	OutlineStyle,
	RawImage,
	RGB,
} from "../shared/types";
import type { CellSamplingMode } from "./cell-sampler";
import type { DetectOptions } from "./detector";
import type { DownsampleOptions } from "./image-operations";

export type ProcessOptions = DetectOptions & {
	/** グリッド候補の各信号を比較検証するための内部向け切り替え。 */
	gridSignals?: Partial<GridSignalOptions>;
	preRemoveBackground?: boolean;
	postRemoveBackground?: boolean;
	/**
	 * コンテンツ BBox でトリミング後、指定ピクセルサイズ（W x H）へ強制変換する。
	 * 有効時は自動グリッド検出（detectGrid）を行わない。
	 *
	 * 注記:
	 * - 条件: forcePixelsW/H の両方を指定する必要がある。
	 * - アップスケーリングが必要な場合は最近傍法（sampleWindow=1）を使用する。
	 */
	forcePixelsW?: number;
	forcePixelsH?: number;
	/**
	 * 指定ピクセルサイズ（W x H）を「ヒント」として、その近傍から精密検索を行う自動グリッド推定を開始する。
	 * 完全なピクセル指定（forcePixelsW/H）と異なり、自動検出は継続して行われる。
	 *
	 * 注記:
	 * - 条件: hintPixelsW/H の両方を指定する必要がある。
	 * - 主に autoGridFromTrimmed 検索の開始点として使用する。
	 */
	hintPixelsW?: number;
	hintPixelsH?: number;
	/**
	 * 背景除去の範囲（off/selected/outer/all）。
	 * RGB 指定 + selected は自動的に outer として扱う。
	 */
	bgRemovalScope?: BackgroundRemovalScope;
	/**
	 * 連結性の探索に斜め方向（8 近傍）を含めるかどうか。
	 */
	bgConnectivity?: Connectivity;
	backgroundTolerance?: number;
	sampleWindow?: number;
	/** セル色の復元方法。アルゴリズム名は内部比較用で、UIには公開しない。 */
	cellSamplingMode?: CellSamplingMode;
	/** 1セルから決定論的に抽出するサンプル数の上限。 */
	maxSamplesPerCell?: number;
	/** 色候補として扱うアルファの下限。 */
	cellAlphaThreshold?: number;
	/** セルを横断する少数色を線や輪郭として保護する。 */
	preserveThinFeatures?: boolean;
	trimToContent?: boolean;
	trimAlphaThreshold?: number;
	/**
	 * 除去対象とみなす最大ピクセル数（元画像のピクセル数）。
	 * 0 の場合は浮遊ノイズを除去しない。
	 */
	floatingMaxPixels?: number;
	/**
	 * trimToContent=true の場合、背景除去後に BBox で切り抜いた領域から出力グリッド（outW/outH）を推定する。
	 */
	autoGridFromTrimmed?: boolean;
	/**
	 * autoGridFromTrimmed のグリッド推定を高速化する（結果に影響する場合がある）。
	 * OFF の場合は旧来の検索ロジックを使用する。
	 *
	 * デフォルト: true
	 */
	fastAutoGridFromTrimmed?: boolean;
	/**
	 * グリッド検出とダウンサンプリングを有効にする（デフォルト ON）。
	 * OFF の場合はグリッド検出とダウンサンプリングを省略する（同サイズのピクセルアート用）。
	 * 背景トリミングと透明化は引き続き適用される。
	 */
	enableGridDetection?: boolean;
	/**
	 * 短い辺を透明ピクセルで埋め、画像を正方形にする。
	 */
	makeSquare?: boolean;
	/**
	 * 元画像のアスペクト比を保つため、出力を透明ピクセルでパディングする。
	 */
	keepAspectRatio?: boolean;
	/**
	 * 色削減を有効にする。
	 */
	reduceColors?: boolean;
	/**
	 * 色削減モード
	 */
	reduceColorMode?: string;
	/**
	 * ディザリングモード
	 */
	ditherMode?: DitherMode;
	/**
	 * 削減後の色数。
	 */
	colorCount?: number;
	/**
	 * ディザリング強度（0〜100）。0 の場合はディザリングしない。
	 */
	ditherStrength?: number;
	/**
	 * 固定パレット
	 */
	fixedPalette?: RGB[];
	/**
	 * 背景抽出方式
	 */
	bgExtractionMethod?:
		| "none"
		| "auto"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb";
	/**
	 * RGB 指定時の背景色（#rrggbb）
	 */
	bgRgb?: string;
	outlineStyle?: OutlineStyle;
	outlineColor?: RGB;
	/**
	 * デバッグ用に中間画像を取得するフック。
	 * ブラウザ環境で扱うための PNG 出力などは呼び出し側で行う。
	 */
	debugHook?: (
		name: string,
		img: RawImage,
		meta?: Record<string, unknown>,
	) => void;
};

const getGlobalDebugHook = (): ProcessOptions["debugHook"] | undefined => {
	const g = globalThis as unknown as {
		__PIXEL_REFINER_DEBUG_HOOK__?: unknown;
	};
	const hook = g.__PIXEL_REFINER_DEBUG_HOOK__;
	return typeof hook === "function"
		? (hook as ProcessOptions["debugHook"])
		: undefined;
};

export const normalizeProcessOptions = (
	options: ProcessOptions | undefined,
): {
	detect: DetectOptions;
	preRemoveBackground: boolean;
	postRemoveBackground: boolean;
	forcePixelsW?: number;
	forcePixelsH?: number;
	hintPixelsW?: number;
	hintPixelsH?: number;
	bgRemovalScope: BackgroundRemovalScope;
	bgConnectivity: Connectivity;
	backgroundTolerance: number;
	sampleWindow: number;
	cellSamplingMode: CellSamplingMode;
	maxSamplesPerCell: number;
	cellAlphaThreshold: number;
	preserveThinFeatures: boolean;
	trimToContent: boolean;
	trimAlphaThreshold: number;
	autoGridFromTrimmed: boolean;
	fastAutoGridFromTrimmed: boolean;
	gridSignals: GridSignalOptions;
	enableGridDetection: boolean;
	makeSquare: boolean;
	keepAspectRatio: boolean;
	reduceColors: boolean;
	reduceColorMode: string;
	ditherMode: DitherMode;
	colorCount: number;
	ditherStrength: number;
	fixedPalette?: RGB[];
	outlineStyle: OutlineStyle;
	outlineColor: RGB;
	floatingMaxPixels: number;
	bgExtractionMethod:
		| "none"
		| "auto"
		| "top-left"
		| "bottom-left"
		| "top-right"
		| "bottom-right"
		| "rgb";
	bgRgb?: string;
	debug?: boolean;
	debugHook?: ProcessOptions["debugHook"];
} => {
	const raw = options ?? {};
	const debug = raw.debug ?? PROCESS_DEFAULTS.debug;
	const debugHook = raw.debugHook ?? (debug ? getGlobalDebugHook() : undefined);

	const detect: DetectOptions = {
		...raw,
		detectionQuantStep: clampInt(
			raw.detectionQuantStep ?? PROCESS_RANGES.detectionQuantStep.default,
			PROCESS_RANGES.detectionQuantStep,
		),
		backgroundMaskTolerance: clampInt(
			raw.backgroundMaskTolerance ??
				PROCESS_RANGES.backgroundMaskTolerance.default,
			PROCESS_RANGES.backgroundMaskTolerance,
		),
	};

	const preRemoveBackground =
		raw.preRemoveBackground ?? PROCESS_DEFAULTS.preRemoveBackground;
	const postRemoveBackground =
		raw.postRemoveBackground ?? PROCESS_DEFAULTS.postRemoveBackground;
	const forcePixelsW = clampOptionalInt(
		raw.forcePixelsW,
		PROCESS_RANGES.forcePixelsW,
	);
	const forcePixelsH = clampOptionalInt(
		raw.forcePixelsH,
		PROCESS_RANGES.forcePixelsH,
	);
	const hintPixelsW = clampOptionalInt(
		raw.hintPixelsW,
		PROCESS_RANGES.forcePixelsW,
	);
	const hintPixelsH = clampOptionalInt(
		raw.hintPixelsH,
		PROCESS_RANGES.forcePixelsH,
	);
	const bgRemovalScope = raw.bgRemovalScope ?? PROCESS_DEFAULTS.bgRemovalScope;
	const bgConnectivity = raw.bgConnectivity ?? PROCESS_DEFAULTS.bgConnectivity;
	const backgroundTolerance = clampInt(
		raw.backgroundTolerance ?? PROCESS_RANGES.backgroundTolerance.default,
		PROCESS_RANGES.backgroundTolerance,
	);
	const sampleWindow = clampInt(
		raw.sampleWindow ?? PROCESS_RANGES.sampleWindow.default,
		PROCESS_RANGES.sampleWindow,
	);
	const cellSamplingMode =
		raw.cellSamplingMode ?? PROCESS_DEFAULTS.cellSamplingMode;
	const maxSamplesPerCell = clampInt(
		raw.maxSamplesPerCell ?? PROCESS_RANGES.maxSamplesPerCell.default,
		PROCESS_RANGES.maxSamplesPerCell,
	);
	const cellAlphaThreshold = clampInt(
		raw.cellAlphaThreshold ?? PROCESS_RANGES.cellAlphaThreshold.default,
		PROCESS_RANGES.cellAlphaThreshold,
	);
	const preserveThinFeatures =
		raw.preserveThinFeatures ?? PROCESS_DEFAULTS.preserveThinFeatures;
	const trimToContent = raw.trimToContent ?? PROCESS_DEFAULTS.trimToContent;
	const trimAlphaThreshold = clampInt(
		raw.trimAlphaThreshold ?? PROCESS_RANGES.trimAlphaThreshold.default,
		PROCESS_RANGES.trimAlphaThreshold,
	);
	const autoGridFromTrimmed =
		raw.autoGridFromTrimmed ?? PROCESS_DEFAULTS.autoGridFromTrimmed;
	const fastAutoGridFromTrimmed =
		raw.fastAutoGridFromTrimmed ?? PROCESS_DEFAULTS.fastAutoGridFromTrimmed;
	const gridSignals = {
		...GRID_SIGNAL_DEFAULTS,
		...raw.gridSignals,
	};
	const makeSquare = raw.makeSquare ?? PROCESS_DEFAULTS.makeSquare;
	const keepAspectRatio =
		raw.keepAspectRatio ?? PROCESS_DEFAULTS.keepAspectRatio;
	const enableGridDetection =
		raw.enableGridDetection ?? PROCESS_DEFAULTS.enableGridDetection;
	const reduceColors = raw.reduceColors ?? PROCESS_DEFAULTS.reduceColors;
	const reduceColorMode =
		raw.reduceColorMode ?? PROCESS_DEFAULTS.reduceColorMode;
	const ditherMode = raw.ditherMode ?? PROCESS_DEFAULTS.ditherMode;
	const colorCount = clampInt(
		raw.colorCount ?? PROCESS_DEFAULTS.colorCount,
		PROCESS_RANGES.colorCount,
	);
	const ditherStrength = clampInt(
		raw.ditherStrength ?? PROCESS_DEFAULTS.ditherStrength,
		PROCESS_RANGES.ditherStrength,
	);

	const outlineStyle = raw.outlineStyle ?? PROCESS_DEFAULTS.outlineStyle;
	const outlineColor = raw.outlineColor ?? PROCESS_DEFAULTS.outlineColor;

	const floatingMaxPixels = clampInt(
		raw.floatingMaxPixels ?? PROCESS_DEFAULTS.floatingMaxPixels,
		PROCESS_RANGES.floatingMaxPixels,
	);
	const bgExtractionMethod =
		raw.bgExtractionMethod ?? PROCESS_DEFAULTS.bgExtractionMethod;
	const bgRgb = raw.bgRgb;

	return {
		detect,
		preRemoveBackground,
		postRemoveBackground,
		forcePixelsW,
		forcePixelsH,
		hintPixelsW,
		hintPixelsH,
		bgRemovalScope,
		bgConnectivity,
		backgroundTolerance,
		sampleWindow,
		cellSamplingMode,
		maxSamplesPerCell,
		cellAlphaThreshold,
		preserveThinFeatures,
		trimToContent,
		trimAlphaThreshold,
		autoGridFromTrimmed,
		fastAutoGridFromTrimmed,
		gridSignals,
		enableGridDetection,
		makeSquare,
		keepAspectRatio,
		reduceColors,
		reduceColorMode,
		ditherMode,
		colorCount,
		ditherStrength,
		fixedPalette: raw.fixedPalette,
		outlineStyle,
		outlineColor,

		floatingMaxPixels,
		bgExtractionMethod,
		bgRgb,
		debug,
		debugHook,
	};
};

export type NormalizedProcessOptions = ReturnType<
	typeof normalizeProcessOptions
>;

export const getDownsampleOptions = (
	options: NormalizedProcessOptions,
	sampleWindow = options.sampleWindow,
): DownsampleOptions => ({
	mode: options.cellSamplingMode,
	sampleWindow,
	maxSamplesPerCell: options.maxSamplesPerCell,
	alphaThreshold: options.cellAlphaThreshold,
	preserveThinFeatures: options.preserveThinFeatures,
});
