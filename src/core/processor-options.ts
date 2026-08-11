import {
	CONVERT_DEFAULTS,
	clampInt,
	clampOptionalInt,
	GRID_SIGNAL_DEFAULTS,
	PROCESS_DEFAULTS,
	PROCESS_RANGES,
} from "../shared/config";
import type {
	AutoBehaviorSetting,
	BackgroundRemovalScope,
	Connectivity,
	DetailLevel,
	DitherMode,
	GeminiWatermarkRemovalMode,
	GridSignalOptions,
	OutlineStyle,
	ProcessingMode,
	RawImage,
	RGB,
	SmallComponentRemovalMode,
} from "../shared/types";
import type { BackgroundBehavior } from "./background";
import type { CellSamplingMode } from "./cell-sampler";
import type { DetectOptions } from "./detector";
import type { DownsampleOptions } from "./image-operations";

export type ProcessOptions = DetectOptions & {
	/** 入力分類を使う自動経路、または処理経路の明示指定。 */
	processingMode?: ProcessingMode;
	/** Convert 経路で採用する論理解像度。 */
	detailLevel?: DetailLevel;
	/** グリッド候補の各信号を個別に有効／無効にする。 */
	gridSignals?: Partial<GridSignalOptions>;
	/** 縁のにじみ（ハロー）を背景色から遠ざける補正を行う。 */
	backgroundDehalo?: boolean;
	/** 縮小後の縁に残った背景色の汚染を、原寸の本来の色へ差し替える。 */
	backgroundEdgeCleanup?: boolean;
	/** なめらかなグラデーション背景を段差の連続としてたどる。 */
	backgroundRampFollow?: boolean;
	/** 消えすぎを検出したときに背景除去を丸ごと巻き戻す。 */
	backgroundRemovalRollback?: boolean;
	/** 境界帯の大半が透明なら、色による背景クラスタ推定を行わない。 */
	alphaBorderBackgroundGuard?: boolean;
	/** 背景モデルの信頼度が下限未満なら背景除去を見送る。 */
	backgroundConfidenceGate?: boolean;
	/** 背景モデルの信頼度が下限未満なら小成分除去を見送る。 */
	smallComponentBackgroundGate?: boolean;
	/** 位相を考慮した格子探索を行い、軸信頼度が十分なら再構成ベースより優先する。 */
	phaseAwareGridSearch?: boolean;
	/** 境界コントラストが明確に優る粗い倍音へ採用格子を乗り換える。 */
	boundaryContrastOverride?: boolean;
	/** 小さな論理解像度の格子で、角シードマスクの境界を基準領域に使う。 */
	smallAspectGridAlignment?: AutoBehaviorSetting;
	/** 透かし除去が成立したとき、末尾行の欠落を防ぐ互換サンプラーへ切り替える。 */
	watermarkSamplingCompat?: AutoBehaviorSetting;
	preRemoveBackground?: boolean;
	postRemoveBackground?: boolean;
	/**
	 * 指定ピクセルサイズ（W x H）へ強制変換する。
	 * 有効時は自動グリッド検出（detectGrid）を行わない。
	 *
	 * 注記:
	 * - 条件: forcePixelsW/H の両方を指定する必要がある。
	 * - セル分割の基準領域は trimToContent に従う。false なら元キャンバス全体、
	 *   true ならコンテンツ BBox を W x H 分割する。
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
	/** 論理ピクセル単位で小成分を安全に除去する強度。 */
	smallComponentMode?: SmallComponentRemovalMode;
	/** 透過背景上で右下に独立している Gemini ウォーターマークを除去する。 */
	geminiWatermarkRemoval?: GeminiWatermarkRemovalMode;
	/**
	 * 除去対象とみなす最大ピクセル数（元画像のピクセル数）。
	 * 0 の場合は浮遊ノイズを除去しない。
	 * @deprecated smallComponentMode を使用する。
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

/**
 * 共有設定から ProcessOptions の既定値一式を組み立てる。
 *
 * [Intended] PROCESS_DEFAULTS のうち ProcessOptions に対応する項目はすべて
 * ここへ含める。新しい既定値を追加するときはこの関数にも反映する
 * （網羅性は processor-options.test.ts が検証する）。
 */
export const createDefaultProcessOptions = () =>
	({
		detectionQuantStep: PROCESS_RANGES.detectionQuantStep.default,
		backgroundMaskTolerance: PROCESS_RANGES.backgroundMaskTolerance.default,
		autoMaxCellsW: PROCESS_RANGES.autoMaxCells.default,
		autoMaxCellsH: PROCESS_RANGES.autoMaxCells.default,
		backgroundTolerance: PROCESS_RANGES.backgroundTolerance.default,
		sampleWindow: PROCESS_RANGES.sampleWindow.default,
		maxSamplesPerCell: PROCESS_RANGES.maxSamplesPerCell.default,
		cellAlphaThreshold: PROCESS_RANGES.cellAlphaThreshold.default,
		trimAlphaThreshold: PROCESS_RANGES.trimAlphaThreshold.default,
		processingMode: PROCESS_DEFAULTS.processingMode,
		detailLevel: PROCESS_DEFAULTS.detailLevel,
		preRemoveBackground: PROCESS_DEFAULTS.preRemoveBackground,
		postRemoveBackground: PROCESS_DEFAULTS.postRemoveBackground,
		bgExtractionMethod: PROCESS_DEFAULTS.bgExtractionMethod,
		bgRemovalScope: PROCESS_DEFAULTS.bgRemovalScope,
		bgConnectivity: PROCESS_DEFAULTS.bgConnectivity,
		trimToContent: PROCESS_DEFAULTS.trimToContent,
		autoGridFromTrimmed: PROCESS_DEFAULTS.autoGridFromTrimmed,
		fastAutoGridFromTrimmed: PROCESS_DEFAULTS.fastAutoGridFromTrimmed,
		enableGridDetection: PROCESS_DEFAULTS.enableGridDetection,
		makeSquare: PROCESS_DEFAULTS.makeSquare,
		keepAspectRatio: PROCESS_DEFAULTS.keepAspectRatio,
		cellSamplingMode: PROCESS_DEFAULTS.cellSamplingMode,
		preserveThinFeatures: PROCESS_DEFAULTS.preserveThinFeatures,
		smallComponentMode: PROCESS_DEFAULTS.smallComponentMode,
		geminiWatermarkRemoval: PROCESS_DEFAULTS.geminiWatermarkRemoval,
		backgroundMask: PROCESS_DEFAULTS.backgroundMask,
		gridSignals: { ...PROCESS_DEFAULTS.gridSignals },
		backgroundDehalo: PROCESS_DEFAULTS.backgroundDehalo,
		backgroundEdgeCleanup: PROCESS_DEFAULTS.backgroundEdgeCleanup,
		backgroundRampFollow: PROCESS_DEFAULTS.backgroundRampFollow,
		backgroundRemovalRollback: PROCESS_DEFAULTS.backgroundRemovalRollback,
		alphaBorderBackgroundGuard: PROCESS_DEFAULTS.alphaBorderBackgroundGuard,
		backgroundConfidenceGate: PROCESS_DEFAULTS.backgroundConfidenceGate,
		smallComponentBackgroundGate: PROCESS_DEFAULTS.smallComponentBackgroundGate,
		phaseAwareGridSearch: PROCESS_DEFAULTS.phaseAwareGridSearch,
		boundaryContrastOverride: PROCESS_DEFAULTS.boundaryContrastOverride,
		smallAspectGridAlignment: PROCESS_DEFAULTS.smallAspectGridAlignment,
		watermarkSamplingCompat: PROCESS_DEFAULTS.watermarkSamplingCompat,
		reduceColors: PROCESS_DEFAULTS.reduceColors,
		reduceColorMode: PROCESS_DEFAULTS.reduceColorMode,
		ditherMode: PROCESS_DEFAULTS.ditherMode,
		colorCount: PROCESS_DEFAULTS.colorCount,
		ditherStrength: PROCESS_DEFAULTS.ditherStrength,
		outlineStyle: PROCESS_DEFAULTS.outlineStyle,
		outlineColor: { ...PROCESS_DEFAULTS.outlineColor },
		debug: PROCESS_DEFAULTS.debug,
	}) satisfies ProcessOptions;

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
	processingMode: ProcessingMode;
	detailLevel: DetailLevel;
	convertReduceColors: boolean;
	convertReduceColorMode: string;
	convertDitherMode: DitherMode;
	convertColorCount?: number;
	convertDitherStrength?: number;
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
	smallComponentMode: SmallComponentRemovalMode;
	geminiWatermarkRemoval: GeminiWatermarkRemovalMode;
	autoGridFromTrimmed: boolean;
	fastAutoGridFromTrimmed: boolean;
	gridSignals: GridSignalOptions;
	backgroundDehalo: boolean;
	backgroundEdgeCleanup: boolean;
	backgroundRampFollow: boolean;
	backgroundRemovalRollback: boolean;
	alphaBorderBackgroundGuard: boolean;
	backgroundConfidenceGate: boolean;
	smallComponentBackgroundGate: boolean;
	phaseAwareGridSearch: boolean;
	boundaryContrastOverride: boolean;
	/** 経路依存を解決済みの実効値。 */
	smallAspectGridAlignment: boolean;
	/** 経路依存を解決済みの実効値。 */
	watermarkSamplingCompat: boolean;
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
	const processingMode = raw.processingMode ?? PROCESS_DEFAULTS.processingMode;
	const detailLevel = raw.detailLevel ?? PROCESS_DEFAULTS.detailLevel;
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
	// [Intended] 新旧オプションが同時に渡された場合は新方式を優先する。
	// 旧オプションだけを明示した呼び出しは従来結果を維持する。
	const useLegacyFloatingRemoval =
		raw.smallComponentMode === undefined && raw.floatingMaxPixels !== undefined;
	const smallComponentMode = useLegacyFloatingRemoval
		? "off"
		: (raw.smallComponentMode ?? PROCESS_DEFAULTS.smallComponentMode);
	const geminiWatermarkRemoval =
		raw.geminiWatermarkRemoval ?? PROCESS_DEFAULTS.geminiWatermarkRemoval;
	const autoGridFromTrimmed =
		raw.autoGridFromTrimmed ?? PROCESS_DEFAULTS.autoGridFromTrimmed;
	const fastAutoGridFromTrimmed =
		raw.fastAutoGridFromTrimmed ?? PROCESS_DEFAULTS.fastAutoGridFromTrimmed;
	const gridSignals = {
		...GRID_SIGNAL_DEFAULTS,
		...raw.gridSignals,
	};
	// [Intended] "auto" は Auto 経路でだけ有効という従来の条件をそのまま表す。
	// 明示指定された "on" / "off" は経路に関わらず優先する。
	const resolveAutoBehavior = (
		setting: AutoBehaviorSetting | undefined,
		fallback: AutoBehaviorSetting,
	): boolean => {
		const value = setting ?? fallback;
		return value === "auto" ? processingMode === "auto" : value === "on";
	};
	const smallAspectGridAlignment = resolveAutoBehavior(
		raw.smallAspectGridAlignment,
		PROCESS_DEFAULTS.smallAspectGridAlignment,
	);
	const watermarkSamplingCompat = resolveAutoBehavior(
		raw.watermarkSamplingCompat,
		PROCESS_DEFAULTS.watermarkSamplingCompat,
	);
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
		useLegacyFloatingRemoval
			? (raw.floatingMaxPixels ?? PROCESS_DEFAULTS.floatingMaxPixels)
			: 0,
		PROCESS_RANGES.floatingMaxPixels,
	);
	const bgExtractionMethod =
		raw.bgExtractionMethod ?? PROCESS_DEFAULTS.bgExtractionMethod;
	const bgRgb = raw.bgRgb;

	return {
		detect,
		processingMode,
		detailLevel,
		convertReduceColors: raw.reduceColors ?? CONVERT_DEFAULTS.reduceColors,
		convertReduceColorMode:
			raw.reduceColorMode ?? CONVERT_DEFAULTS.reduceColorMode,
		convertDitherMode: raw.ditherMode ?? CONVERT_DEFAULTS.ditherMode,
		convertColorCount: raw.colorCount === undefined ? undefined : colorCount,
		convertDitherStrength:
			raw.ditherStrength === undefined ? undefined : ditherStrength,
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
		smallComponentMode,
		geminiWatermarkRemoval,
		autoGridFromTrimmed,
		fastAutoGridFromTrimmed,
		gridSignals,
		backgroundDehalo: raw.backgroundDehalo ?? PROCESS_DEFAULTS.backgroundDehalo,
		backgroundEdgeCleanup:
			raw.backgroundEdgeCleanup ?? PROCESS_DEFAULTS.backgroundEdgeCleanup,
		backgroundRampFollow:
			raw.backgroundRampFollow ?? PROCESS_DEFAULTS.backgroundRampFollow,
		backgroundRemovalRollback:
			raw.backgroundRemovalRollback ??
			PROCESS_DEFAULTS.backgroundRemovalRollback,
		alphaBorderBackgroundGuard:
			raw.alphaBorderBackgroundGuard ??
			PROCESS_DEFAULTS.alphaBorderBackgroundGuard,
		backgroundConfidenceGate:
			raw.backgroundConfidenceGate ?? PROCESS_DEFAULTS.backgroundConfidenceGate,
		smallComponentBackgroundGate:
			raw.smallComponentBackgroundGate ??
			PROCESS_DEFAULTS.smallComponentBackgroundGate,
		phaseAwareGridSearch:
			raw.phaseAwareGridSearch ?? PROCESS_DEFAULTS.phaseAwareGridSearch,
		boundaryContrastOverride:
			raw.boundaryContrastOverride ?? PROCESS_DEFAULTS.boundaryContrastOverride,
		smallAspectGridAlignment,
		watermarkSamplingCompat,
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

/**
 * 背景処理の自動判定の有効／無効を、背景モジュールが受け取る形へまとめる。
 *
 * [Intended] 呼び出し側は正規化済みオプションだけを持ち回れば済むようにする。
 * 個々のフラグ名を背景モジュールの語彙へ翻訳するのはここ 1 箇所に閉じる。
 */
export const getBackgroundBehavior = (
	options: NormalizedProcessOptions,
): BackgroundBehavior => ({
	dehalo: options.backgroundDehalo,
	rollback: options.backgroundRemovalRollback,
	confidenceGate: options.backgroundConfidenceGate,
	alphaBorderGuard: options.alphaBorderBackgroundGuard,
	rampFollow: options.backgroundRampFollow,
});

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
