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
};

export interface RGB {
	r: number; // 0-255
	g: number; // 0-255
	b: number; // 0-255
}

export type OutlineStyle = "none" | "rounded" | "sharp";

/** Scope of background removal */
export type BackgroundRemovalScope = "off" | "selected" | "outer" | "all";

/** Whether to include diagonals (8-neighbors) in connectivity check */
export type Connectivity = "4" | "8";

export interface Oklab {
	L: number; // Lightness
	a: number; // Green-Red component
	b: number; // Blue-Yellow component
}

// Pixel data with transparency
export interface PixelData extends RGB {
	alpha: number; // 0-255 (Alpha)
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
	/** A relative 0-1 comparison indicator, not a calibrated probability. */
	confidence: number;
	subscores?: Partial<GridCandidateSubscores>;
};

export type ProcessingAnalysis = {
	classification?: InputClassification;
	route: ProcessingRoute;
	/** A relative 0-1 comparison indicator, not a calibrated probability. */
	confidence: number;
	warnings: ProcessingWarningCode[];
	gridCandidates: GridCandidateReport[];
	selectedCandidateIndex?: number;
	foregroundRatioBefore?: number;
	foregroundRatioAfter?: number;
	contentLossRatio?: number;
};

export type ProcessResult = {
	result: RawImage;
	grid: PixelGrid;
	extractedPalette: RGB[];
	/** Original image normalized to the output geometry for comparison. */
	compareBefore: RawImage;
	/** Sanitized input normalized to the output geometry for comparison. */
	compareBeforeSanitized: RawImage;
	analysis: ProcessingAnalysis;
};
