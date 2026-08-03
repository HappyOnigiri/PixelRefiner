import type { DetailLevel, RGB } from "./types";

export type IntRange = {
	min: number;
	max: number;
	default: number;
};

export const PROCESS_RANGES = {
	// 検出器: ポスタライズの段階数
	detectionQuantStep: { min: 1, max: 128, default: 64 } as const,
	// 検出器: 支配的な背景色に対するチャンネルごとの許容値
	backgroundMaskTolerance: { min: 0, max: 255, default: 0 } as const,
	// 処理器: ダウンサンプリング時の中央値ウィンドウ
	sampleWindow: { min: 1, max: 9, default: 3 } as const,
	// 処理器: 1セルから評価するサンプル数の上限
	maxSamplesPerCell: { min: 1, max: 256, default: 32 } as const,
	// 処理器: 色候補として扱うアルファの下限
	cellAlphaThreshold: { min: 0, max: 255, default: 16 } as const,
	// 塗りつぶしの許容値（チャンネルごと）
	backgroundTolerance: { min: 0, max: 255, default: 64 } as const,
	// トリミング用の境界ボックスしきい値
	trimAlphaThreshold: { min: 1, max: 255, default: 16 } as const,
	// UI: 小さな孤立領域を除去するしきい値（総ピクセル数に対する割合）
	floatingMaxPercent: { min: 0, max: 100, default: 3 } as const,
	// 小さな孤立領域（連結成分）を背景として除去する
	floatingMaxPixels: { min: 0, max: 1000000, default: 0 } as const,
	// 出力ピクセルサイズを強制する（境界ボックスのトリミング後）
	forcePixelsW: { min: 1, max: 1024, default: 0 } as const,
	forcePixelsH: { min: 1, max: 1024, default: 0 } as const,
	// 減色
	colorCount: { min: 2, max: 256, default: 32 } as const,
	// ディザリング
	ditherStrength: { min: 0, max: 100, default: 0 } as const,
	// アウトライン
	outlineColor: { r: 255, g: 255, b: 255 }, // デフォルトの白
} as const satisfies Record<string, IntRange | RGB>;

export const PROCESS_ANALYSIS_THRESHOLDS = {
	contentLossRatio: 0.5,
	gridScoreScale: 16,
	extremeOutputDimension: 4096,
	minLargeInputArea: 4096,
	minSafeOutputArea: 4,
	maxCellAspectRatio: 8,
	maxAxisScoreDifferenceRatio: 0.9,
	gridCandidateConfidenceThreshold: 0.3,
	gridCandidateSampleLimit: 65536,
	gridCandidateReconstructionScale: 48,
	legacyPreserveCandidateScore: 1_000_000,
} as const;

export const CANDIDATE_PREVIEW_LIMITS = {
	maxCandidates: 4,
	maxThumbnailDimension: 192,
	maxCacheEntries: 8,
} as const;

export const INPUT_CLASSIFIER_THRESHOLDS = {
	maxSamplePixels: 65_536,
	minDimension: 2,
	nativeMaxDimension: 64,
	nativeSafeMaxDimension: 12,
	nativeUniqueColorRatio: 0.35,
	nativeFlatNeighborRatio: 0.42,
	smoothGradientMaxDifference: 96,
	scaledGridConfidence: 0.3,
	scaledMinGridScale: 1.5,
	scaledFlatNeighborRatio: 0.48,
	softGridConfidence: 0.24,
	softMinGridScale: 1.35,
	softSmoothGradientRatio: 0.5,
	continuousUniqueColorRatio: 0.12,
	continuousSmoothGradientRatio: 0.62,
	continuousFlatNeighborRatio: 0.18,
} as const;

// 分類が返す信頼度（ルール適合度）の基準値とスケール係数。
// 各分類は base から始まり、超過分 (strength - 1) に scale を掛けた値を max で頭打ちにする。
export const INPUT_CLASSIFIER_CONFIDENCE = {
	base: 0.55,
	emptyOrTiny: 1,
	nativeSafe: 0.85,
	scaledMax: 0.99,
	scaledScale: 0.35,
	continuousMax: 0.98,
	continuousScale: 0.25,
	softMax: 0.95,
	softScale: 0.3,
	nativeMax: 0.95,
	nativeScale: 0.25,
	uncertain: 0.5,
} as const;

export const CONVERT_LIMITS = {
	minShortSide: 8,
	maxShortSide: 96,
	baseAreaDivisor: 2.4,
	informationAdjustment: 0.4,
	maxAnalysisPixels: 65_536,
	edgeThreshold: 0.08,
	edgeBoost: 2.25,
	// セル内の高コントラスト色を代表色へ昇格させる最小の色距離（Oklab の二乗距離）
	featureDistanceThreshold: 0.0625,
	// 同じ昇格に必要な最小の面積被覆率。孤立ノイズを除外する下限
	featureCoverageThreshold: 0.04,
} as const;

export const CONVERT_CANDIDATE_DEFAULTS = {
	coarse: { scale: 0.65, colorCount: 12, ditherStrength: 30 },
	balanced: { scale: 1, colorCount: 24, ditherStrength: 20 },
	detailed: { scale: 1.5, colorCount: 40, ditherStrength: 10 },
} as const satisfies Record<
	DetailLevel,
	{ scale: number; colorCount: number; ditherStrength: number }
>;

export const CONVERT_DEFAULTS = {
	detailLevel: "balanced",
	reduceColors: true,
	reduceColorMode: "auto",
	ditherMode: "ordered",
} as const;

export const BACKGROUND_MODEL_LIMITS = {
	borderBandRatio: 0.08,
	minBorderBandPixels: 1,
	maxClusters: 4,
	clusterIterations: 6,
	minClusterWeight: 0.04,
	minConfidence: 0.55,
	maxContentLossRatio: 0.92,
	baseOklabTolerance: 0.018,
	maxOklabTolerance: 0.2,
	varianceScale: 2.5,
	varianceConfidenceScale: 0.012,
	maxBorderSamples: 262_144,
	dehaloRadius: 2,
	dehaloMaxChannelChange: 32,
	dehaloMaxRgbDistance: 128,
	dehaloPushStrength: 0.35,
	dehaloSourceBlend: 0.35,
	dehaloInteriorBlend: 0.65,
} as const;

export const GRID_CANDIDATE_SCORE_WEIGHTS = {
	colorBoundary: 0.08,
	luminanceGradient: 0.08,
	alphaGradient: 0.04,
	autocorrelation: 0.12,
	localPhaseStability: 0.1,
	periodicity: 0.08,
	edgeAlignment: 0.04,
	reconstruction: 0.16,
	complexity: 0.05,
	coverage: 0.04,
	axisAgreement: 0.08,
	methodAgreement: 0.05,
	stability: 0.03,
	harmonic: 0.03,
	outputSize: 0.02,
} as const;

export const GRID_SIGNAL_DEFAULTS = {
	colorBoundary: true,
	luminanceAlphaGradient: true,
	autocorrelation: true,
	reconstruction: true,
	localPhaseStability: true,
} as const;

export const GRID_CANDIDATE_CELL_SCALES = [0.5, 2] as const;

export const GRID_SEARCH_LIMITS = {
	axisCandidateLimit: 24,
	pairCandidateLimit: 128,
	fullResolutionCandidateLimit: 32,
	outputDimensionLimit: 600,
	maxTransitionSamples: 32,
	maxAnalysisDimension: 256,
	axisConfidenceThreshold: 0.55,
	localRegionCount: 4,
	minimumAutocorrelationSamples: 3,
	fullResolutionSampleLimit: 16384,
} as const;

export const RETRO_PALETTES: Record<
	string,
	{ name: string; colors: string[] }
> = {
	gb_legacy: {
		name: "Game Boy (Legacy)",
		colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"],
	},
	gb_pocket: {
		name: "Game Boy (Pocket)",
		colors: ["#000000", "#545454", "#a8a8a8", "#ffffff"],
	},
	gb_light: {
		name: "Game Boy (Light)",
		colors: ["#004040", "#15605d", "#308880", "#00e0e0"],
	},
	pico8: {
		name: "PICO-8",
		colors: [
			"#000000",
			"#1D2B53",
			"#7E2553",
			"#008751",
			"#AB5236",
			"#5F574F",
			"#C2C3C7",
			"#FFF1E8",
			"#FF004D",
			"#FFA300",
			"#FFEC27",
			"#00E436",
			"#29ADFF",
			"#83769C",
			"#FF77A8",
			"#FFCCAA",
		],
	},
	nes: {
		name: "NES",
		colors: [
			"#7C7C7C",
			"#0000FC",
			"#0000BC",
			"#4428BC",
			"#940084",
			"#A80020",
			"#A81000",
			"#881400",
			"#503000",
			"#007800",
			"#006800",
			"#005800",
			"#004058",
			"#000000",
			"#000000",
			"#000000",
			"#BCBCBC",
			"#0078F8",
			"#0058F8",
			"#6844FC",
			"#D800CC",
			"#E40058",
			"#F83800",
			"#E45C10",
			"#AC7C00",
			"#00B800",
			"#00A800",
			"#00A844",
			"#008888",
			"#000000",
			"#000000",
			"#000000",
			"#F8F8F8",
			"#3CBCFC",
			"#6888FC",
			"#9878F8",
			"#F878F8",
			"#F85898",
			"#F87858",
			"#FCA044",
			"#F8B800",
			"#B8F818",
			"#58D854",
			"#58F898",
			"#00E8D8",
			"#787878",
			"#000000",
			"#000000",
			"#FCFCFC",
			"#A4E4FC",
			"#B8B8F8",
			"#D8B8F8",
			"#F8B8F8",
			"#F8A4C0",
			"#F0D0B0",
			"#FCE0A8",
			"#F8D878",
			"#D8F878",
			"#B8F8B8",
			"#B8F8D8",
			"#00FCFC",
			"#F8D8F8",
			"#000000",
			"#000000",
		],
	},
	mono: {
		name: "Monochrome",
		colors: ["#000000", "#FFFFFF"],
	},
	pc98: {
		name: "PC-9801",
		colors: [
			"#000000",
			"#0000F8",
			"#F80000",
			"#F800F8",
			"#00F800",
			"#00F8F8",
			"#F8F800",
			"#F8F8F8",
			"#888888",
			"#000088",
			"#880000",
			"#880088",
			"#008800",
			"#008888",
			"#888800",
			"#C0C0C0",
		],
	},
	msx: {
		name: "MSX1",
		colors: [
			"#000000",
			"#3EB849",
			"#74D07D",
			"#5955E0",
			"#8076F1",
			"#B95E51",
			"#65DBEF",
			"#DB6559",
			"#FF897D",
			"#CCC35E",
			"#DED087",
			"#3AA241",
			"#B766B5",
			"#CCCCCC",
			"#FFFFFF",
		],
	},
	c64: {
		name: "Commodore 64",
		colors: [
			"#000000",
			"#FFFFFF",
			"#813338",
			"#75CEC8",
			"#8E3C97",
			"#56AC4D",
			"#2E2C9B",
			"#EDF171",
			"#8E5029",
			"#553800",
			"#C46C71",
			"#4A4A4A",
			"#7B7B7B",
			"#A9FF9F",
			"#706DEB",
			"#B2B2B2",
		],
	},
	arne16: {
		name: "Arne 16",
		colors: [
			"#000000",
			"#9D9D9D",
			"#FFFFFF",
			"#BE2633",
			"#E06F8B",
			"#493C2B",
			"#A46422",
			"#EB8931",
			"#F7E26B",
			"#2F484E",
			"#44891A",
			"#A3CE27",
			"#1B2632",
			"#005784",
			"#31A2F2",
			"#B2DCEF",
		],
	},
	sfc_sprite: {
		name: "SFC Style (16 colors/Sprite)",
		colors: [], // K-means で 16 色に減色し、15 ビットに丸める
	},
	sfc_bg: {
		name: "SFC Style (256 colors/BG)",
		colors: [], // K-means で 256 色に減色し、15 ビットに丸める
	},
};

export const PROCESS_DEFAULTS = {
	// [Policy] Auto のUI導入までは既存利用者の出力互換性を優先する。
	processingMode: "refine",
	detailLevel: CONVERT_DEFAULTS.detailLevel,
	preRemoveBackground: true,
	postRemoveBackground: true,
	bgExtractionMethod: "auto",
	// 背景除去の範囲（off/selected/outer/all）
	bgRemovalScope: "outer",
	// 連結探索に対角方向（8 近傍）を含めるか（4=いいえ、8=はい）
	bgConnectivity: "4",
	// 処理後にコンテンツの境界ボックスまでトリミングする（デフォルトは ON）
	trimToContent: true,
	autoGridFromTrimmed: true,
	// autoGridFromTrimmed のグリッド推定を高速化する（結果に影響する場合がある）
	fastAutoGridFromTrimmed: true,
	// グリッド検出とダウンサンプリングを有効にする（デフォルトは ON）
	enableGridDetection: true,
	// 短い辺を透明ピクセルで埋めて画像を正方形にする
	makeSquare: false,
	// 出力に余白を追加して元画像のアスペクト比を維持する
	keepAspectRatio: false,
	// グリッド検出モード（UI 用）
	gridDetectionMode: "auto",
	// [Intended] UIにはアルゴリズム名を出さず、Autoで頑健なセル復元を使う。
	cellSamplingMode: "alpha-aware-medoid",
	preserveThinFeatures: true,

	floatingMaxPixels: PROCESS_RANGES.floatingMaxPixels.default,
	reduceColors: false,
	reduceColorMode: "none", // "none" | "auto" | "gb_legacy" | "gb_pocket" | "gb_light" | "pico8" | "nes" | "mono" | "custom"
	ditherMode: "none",
	colorCount: PROCESS_RANGES.colorCount.default,
	ditherStrength: PROCESS_RANGES.ditherStrength.default,
	outlineStyle: "none",
	outlineColor: PROCESS_RANGES.outlineColor,
	debug: import.meta.env.DEV,
} as const;

export const clampInt = (value: number, range: IntRange): number => {
	const v = Number.isFinite(value) ? Math.trunc(value) : range.default;
	return Math.min(range.max, Math.max(range.min, v));
};

export const clampNumber = (
	value: number,
	range: { min: number; max: number; default: number },
): number => {
	const v = Number.isFinite(value) ? value : range.default;
	return Math.min(range.max, Math.max(range.min, v));
};

export const clampOptionalInt = (
	value: number | undefined,
	range: IntRange,
): number | undefined => {
	if (value === undefined) return undefined;
	if (!Number.isFinite(value)) return undefined;
	return clampInt(value, range);
};
