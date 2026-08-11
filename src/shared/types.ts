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
	/**
	 * 予測セル境界に実エッジが集まる度合い（1.0 で偏りなし）。
	 * [Intended] 「格子として妥当か」ではなく「そもそも格子が読み取れているか」を表す。
	 * 候補同士の相対比較では曖昧さを検出できないため、絶対量として持ち回す。
	 */
	gridEvidence?: number;
	/**
	 * 乗り換え先として許す出力高さの範囲で得られた、最大の境界コントラスト。
	 * [Policy] 数セルしか無い格子は偶然の一致で跳ね上がるため、その範囲は含めない。
	 */
	gridEvidenceMax?: number;
	/**
	 * 採用格子と、境界がもっとも揃う格子が食い違っているか。
	 * [Intended] 指標同士が別の倍率を指している状態で、曖昧さの直接の証拠になる。
	 */
	gridEvidenceContested?: boolean;
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
export type BackgroundRemovalScope =
	| "off"
	| "selected"
	| "outer"
	| "auto"
	| "all";

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

export type ProcessingMode = "auto" | ProcessingRoute;

export type DetailLevel = "coarse" | "balanced" | "detailed";

export type SmallComponentRemovalMode = "off" | "light" | "auto" | "strong";

export type GeminiWatermarkRemovalMode = "off" | "auto";

export type SmallComponentRemovalDiagnostic = {
	mode: SmallComponentRemovalMode | "legacy";
	applied: boolean;
	skippedReason?: "off" | "background-disabled" | "low-background-confidence";
	removedComponents: number;
	removedPixels: number;
	pixelBasis: "logical" | "source";
};

export type ConvertCandidate = {
	label: DetailLevel;
	outW: number;
	outH: number;
	colorCount: number;
	ditherStrength: number;
};

export type InputClassification =
	| "native-pixel"
	| "scaled-pixel"
	| "soft-pixel"
	| "continuous"
	| "uncertain";

export type ClassificationFeatures = {
	uniqueColorRatio: number;
	flatNeighborRatio: number;
	smoothGradientRatio: number;
	visiblePixelRatio: number;
	gridConfidence: number;
	gridScale: number;
};

export type ClassificationReason =
	| "EMPTY_OR_TINY_INPUT"
	| "NATIVE_PIXEL_STRUCTURE"
	| "INTEGER_GRID_STRUCTURE"
	| "SOFT_GRID_STRUCTURE"
	| "CONTINUOUS_TONE_STRUCTURE"
	| "LOW_CLASSIFICATION_CONFIDENCE";

export type InputClassificationResult = {
	classification: InputClassification;
	/** 較正済みの確率ではなく、0～1 のルール適合度。 */
	confidence: number;
	features: ClassificationFeatures;
	reasons: ClassificationReason[];
};

export type ProcessingWarningCode =
	| "LOW_GRID_CONFIDENCE"
	| "BACKGROUND_UNCERTAIN"
	| "BACKGROUND_REMOVAL_SKIPPED"
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

/** 背景除去 1 段階の実施結果。 */
export type BackgroundRemovalStageOutcome = {
	/** その段階の除去を実行したか。 */
	attempted: boolean;
	/** 消えすぎ検出により入力をそのまま返したか。 */
	rolledBack: boolean;
	/**
	 * その段階が実際に背景の透過を作ったか。
	 * [Intended] ロールバックしていないことは透過を作ったことを意味しない。背景モデルが
	 * 立たない場合や除去対象が 1 画素も無い場合も、入力をそのまま返して巻き戻しにはならない。
	 */
	removed: boolean;
};

/** 自動背景モデルの診断情報。手動背景指定では省略する。 */
export type BackgroundDiagnostic = {
	confidence: number;
	/**
	 * 原寸に対する事前除去の実施結果。
	 * [Intended] 事前除去と事後除去は解像度が違うため消えすぎ判定も別々に出る。
	 * 出力向けの結論を出すには段階ごとの結果を残しておく必要がある。
	 */
	preRemoval: BackgroundRemovalStageOutcome;
	/**
	 * 出力解像度に対する事後除去の実施結果。事後除去の段階を通る前は未設定。
	 * [Intended] 「透過を中止した」と伝えてよいかは段階ごとの結果から導く。結論を欄として
	 * 持たせると、書き換えを忘れた経路で古い結論がそのまま警告になる。
	 */
	postRemoval?: BackgroundRemovalStageOutcome;
};

export type ProcessingAnalysis = {
	classification?: InputClassification;
	classificationFeatures?: ClassificationFeatures;
	classificationReasons?: ClassificationReason[];
	/**
	 * 入力分類のルール適合度（0～1）。分類を行った場合のみ設定する。
	 * [Policy] グリッド候補の指標である confidence とは別の量なので、同じ欄に混ぜない。
	 */
	classificationConfidence?: number;
	route: ProcessingRoute;
	/** 較正済みの確率ではなく、0～1 の相対比較指標。 */
	confidence: number;
	warnings: ProcessingWarningCode[];
	gridCandidates: GridCandidateReport[];
	selectedCandidateIndex?: number;
	/**
	 * Auto 処理が実際に採用した候補の位置。
	 * [Intended] 低信頼時に selectedCandidateIndex が未確定でも、候補 UI から
	 * 実際の Auto 結果を識別して再選択できるようにする。
	 */
	autoResultCandidateIndex?: number;
	/**
	 * Auto 処理の実出力サイズ。autoResultCandidateIndex がある場合のみ設定する。
	 * [Policy] gridCandidates のレポート値は検出後のトリミングで実出力とずれることが
	 * あるため、候補の相対ラベル（細かめ・粗め）の基準にはこの実測値を使う。
	 */
	autoResultOutW?: number;
	autoResultOutH?: number;
	foregroundRatioBefore?: number;
	foregroundRatioAfter?: number;
	contentLossRatio?: number;
	/** 自動背景モデルの信頼度。手動背景指定では省略する。 */
	backgroundConfidence?: number;
	/** 小成分除去の適用結果。 */
	smallComponentRemoval?: SmallComponentRemovalDiagnostic;
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

export type CandidateKind =
	| "recommended"
	| "auto-result"
	| "finer"
	| "coarser"
	| "preserve"
	| "convert";

export type CandidateSelection = {
	id: string;
	kind: CandidateKind;
	recommended: boolean;
	processingMode: ProcessingMode;
	outW?: number;
	outH?: number;
	detailLevel?: DetailLevel;
};

export type CandidatePreview = CandidateSelection & {
	preview: RawImage;
	resultWidth: number;
	resultHeight: number;
	colorCount: number;
};
