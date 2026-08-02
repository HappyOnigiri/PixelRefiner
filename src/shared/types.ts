export type RawImage = {
	width: number;
	height: number;
	data: Uint8ClampedArray; // RGBA
};

export type Pixel = [number, number, number, number] | Uint8ClampedArray;

export type Axis = "x" | "y";

export type PixelGrid = {
	cellW: number;
	cellH: number;
	offsetX: number;
	offsetY: number;
	score: number;
	cropX?: number;
	cropY?: number;
	cropW?: number;
	cropH?: number;
	outW?: number;
	outH?: number;
	scoreX?: number;
	scoreY?: number;
	candidates?: PixelGrid[];
	detectionFailedAxes?: Axis[];
	signalScores?: GridSignalScores;
};

export type GridSignalOptions = {
	colorBoundary: boolean;
	luminanceAlphaGradient: boolean;
	autocorrelation: boolean;
	reconstruction: boolean;
	localPhaseStability: boolean;
};

export type GridSignalScores = {
	colorBoundary: number;
	luminanceGradient: number;
	alphaGradient: number;
	autocorrelation: number;
	reconstruction: number;
	localPhaseStability: number;
	methodAgreement: number;
};

export interface RGB {
	r: number; // 0～255
	g: number; // 0～255
	b: number; // 0～255
}

export type OutlineStyle = "none" | "rounded" | "sharp";

/** 背景除去の範囲 */
export type BackgroundRemovalScope = "off" | "selected" | "outer" | "all";

/** 連結判定に対角方向（8 近傍）を含めるか */
export type Connectivity = "4" | "8";

export interface Oklab {
	L: number; // 明度
	a: number; // 緑-赤成分
	b: number; // 青-黄成分
}

// 透明度を持つピクセルデータ
export interface PixelData extends RGB {
	alpha: number; // 0～255（アルファ）
}

export type DitherMode =
	| "none"
	| "floyd-steinberg"
	| "bayer-2x2"
	| "bayer-4x4"
	| "bayer-8x8"
	| "ordered";

export interface Palette {
	id: string;
	name: string;
	colors: RGB[];
}

export type ProcessingRoute = "refine" | "convert" | "preserve";

export type InputClassification =
	| "native-pixel"
	| "scaled-pixel"
	| "soft-pixel"
	| "continuous"
	| "uncertain";

export type ProcessingWarningCode =
	| "LOW_GRID_CONFIDENCE"
	| "BACKGROUND_UNCERTAIN"
	| "CONTENT_LOSS_RISK"
	| "ONE_AXIS_DETECTION_FAILED"
	| "EXTREME_OUTPUT_SIZE"
	| "NO_CONTENT"
	| "FALLBACK_TO_PRESERVE";

export type GridCandidateSubscores = {
	colorBoundary: number;
	luminanceGradient: number;
	alphaGradient: number;
	autocorrelation: number;
	localPhaseStability: number;
	periodicity: number;
	edgeAlignment: number;
	reconstruction: number;
	complexity: number;
	coverage: number;
	axisAgreement: number;
	methodAgreement: number;
	stability: number;
	harmonic: number;
	outputSize: number;
};

export type GridCandidateReport = {
	grid: PixelGrid;
	angle?: number;
	outW: number;
	outH: number;
	cropX: number;
	cropY: number;
	cropW: number;
	cropH: number;
	method: string;
	totalScore: number;
	/** 較正済みの確率ではなく、0～1 の相対比較指標。 */
	confidence: number;
	subscores?: Partial<GridCandidateSubscores>;
};

export type ProcessingAnalysis = {
	classification?: InputClassification;
	route: ProcessingRoute;
	/** 較正済みの確率ではなく、0～1 の相対比較指標。 */
	confidence: number;
	warnings: ProcessingWarningCode[];
	gridCandidates: GridCandidateReport[];
	selectedCandidateIndex?: number;
	foregroundRatioBefore?: number;
	foregroundRatioAfter?: number;
	contentLossRatio?: number;
	/** 自動背景モデルの信頼度。手動背景指定では省略する。 */
	backgroundConfidence?: number;
};

export type ProcessResult = {
	result: RawImage;
	grid: PixelGrid;
	extractedPalette: RGB[];
	/** 比較用に出力形状へ正規化した元画像。 */
	compareBefore: RawImage;
	/** 比較用に出力形状へ正規化したサニタイズ済み入力。 */
	compareBeforeSanitized: RawImage;
	analysis: ProcessingAnalysis;
};
