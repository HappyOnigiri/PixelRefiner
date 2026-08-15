import type { QuickSettingsState } from "../../src/browser/quick-settings";
import type {
	CandidateSuggestionDecision,
	CandidateSuggestionReason,
	WarningPresentation,
} from "../../src/core/candidate-suggestion-decision";
import type { ProcessOptions } from "../../src/core/processor";
import type {
	CandidateKind,
	CellScale,
	DitherMode,
	ProcessingMode,
} from "../../src/shared/types";

export const QUALITY_REPORT_VERSION = "7";
export const QUALITY_BENCHMARK_VERSION = "2";
export const QUALITY_BASELINE_VERSION = 3;

export type QualityChangeStatus = "changed" | "unchanged" | "new";

/** 固定した目標と、その目標に紐づく合格条件に対する品質判定。 */
export type QualityTargetStatus = "met" | "unmet" | "missing";

export type FixtureAssetProvenance = {
	file: string;
	sourceType: "generated-code" | "generated-ai" | "external";
	sourceUrl?: string;
	author?: string;
	license: string;
	licenseUrl?: string;
	modificationAllowed: boolean;
	redistributionAllowed: boolean;
	commercialUseAllowed: boolean;
	acquiredOrGeneratedAt: string;
	termsCheckedAt?: string;
	provider?: string;
	model?: string;
	prompt?: string;
};

export type QualityExpectation = {
	exact?: boolean;
	maxMeanRgbaError?: number;
	minEdgeF1?: number;
	minBackgroundMaskIou?: number;
	minSmallComponentRetention?: number;
	expectedWidth?: number;
	expectedHeight?: number;
};

/**
 * ケースが処理オプションをどう決めるか。
 * explicit はケース定義のオプション指定あり、auto は UI 既定のみで自動判定に任せる。
 */
export type QualityParameterMode = "explicit" | "auto";

export type QualityImageCase = {
	id: string;
	featureIds: string[];
	optionNames?: string[];
	profile: "smoke" | "full";
	/** 省略時は explicit。cases.json の既存ケースは指定不要。 */
	parameterMode?: QualityParameterMode;
	inputKind: string;
	degradationPatterns: string[];
	/**
	 * 組み込みプリセットをそのまま使うケースの、プリセット ID。
	 * [Intended] 指定したケースは options を持たず、実行時に benchmark 側が
	 * プリセットの内容へ差し替える。オプション一式をケース定義へ写すと、
	 * プリセットを変えたときに両方直す必要が出て、出荷される値との一致が崩れる。
	 */
	presetId?: string;
	/**
	 * かんたん設定だけを操作するケースの、既定から変える項目。
	 * [Intended] presetId と同じ理由で、解決後のオプション一式ではなく操作内容を持つ。
	 * ガイドが案内する手順にプリセットが無い場合はこちらで表す。
	 */
	quickSettings?: Partial<QuickSettingsState>;
	options: ProcessOptions;
	sharedPalette?: {
		inputs: string[];
		colorCount: number;
		ditherMode: DitherMode;
		ditherStrength: number;
	};
	input: string;
	/** auto ケースは正解画像を持たず、承認済みベースラインを基準に測る。 */
	expected?: string;
	assertions: string[];
	expectation: QualityExpectation;
	assets: FixtureAssetProvenance[];
};

/**
 * 候補リストに並ぶ選択肢 1 件。ブラウザと同じ候補プランから作る。
 * [Intended] 生成に失敗した候補も欠番として残す。表示見込みの判定はプラン数だけで
 * 決めるため、生成失敗は判定に現れず、ここを見ないと気付けない。
 */
export type QualityCandidateOption = {
	id: string;
	kind: CandidateKind;
	recommended: boolean;
	// [Intended] Auto 実結果の選択肢は Auto 経路の再実行で作るため auto を取る。
	// ProcessingRoute では表せないので処理モードとして持つ。
	processingMode: ProcessingMode;
	/** kind が "cell-scale" のときのセル倍率。段階ごとに 1 件ずつ並ぶため表示に使う。 */
	cellScale?: CellScale;
	/** 生成に失敗した候補は null。 */
	outputWidth: number | null;
	outputHeight: number | null;
	colorCount: number | null;
	/** 選択肢の出力画像。生成に失敗した候補は null。 */
	file: string | null;
};

/**
 * レポートを生成した経路。掲載できるメタ情報が経路ごとに違う。
 * pull-request は PR とその base、release は main へ入った成果と 1 つ前のリリース、
 * local は手元実行で、参照できるのは生成時刻だけ。
 */
export type QualityReportKind = "pull-request" | "release" | "local";

export type QualityMetadata = {
	repositoryUrl: string;
	kind: QualityReportKind;
	prNumber: string;
	headCommit: string;
	baseCommit: string;
	/** release レポートが前回生成の取得元にしたリリースタグ。取得できなければ null。 */
	previousVersion: string | null;
	generatedAt: string;
	workflowRunUrl: string;
	benchmarkVersion: string;
	reportVersion: string;
	baselineCommit: string;
};

export type QualityMetrics = {
	outputWidth: number;
	outputHeight: number;
	sizeCorrect: boolean;
	top3SizeCorrect: boolean;
	gridPhaseError: number;
	meanRgbaError: number;
	edgeF1: number;
	backgroundMaskIou: number;
	smallComponentRetention: number;
	byteIdentical: boolean;
	catastrophicFailure: boolean;
	runtimeMs: number;
	approxPeakBytes: number;
};

/**
 * 固定した目標画像との比較。ベースライン比較が「前回から何が変わったか」を見るのに対し、
 * こちらは「あるべき姿にどれだけ足りていないか」を見る。
 * [Policy] ゲート判定には使わない。目標に届かないことが分かっているケースを含むため、
 * 失敗にすると全件が赤のままになり回帰検知が機能しなくなる。
 */
export type QualityTargetMetrics = {
	targetWidth: number;
	targetHeight: number;
	sizeMatches: boolean;
	exactMatch: boolean;
	meanRgbaError: number;
	edgeF1: number;
	backgroundMaskIou: number;
	smallComponentRetention: number;
};

export type QualityBaselineCase = {
	id: string;
	status: "passed" | "failed";
	outputWidth: number;
	outputHeight: number;
	meanRgbaError: number;
	edgeF1: number;
	backgroundMaskIou: number;
	smallComponentRetention: number;
	catastrophicFailure: boolean;
};

/**
 * [Intended] auto ケースの regression のうち、head でベースライン画像が更新済み
 * （= 劣化が宣言済み）としてゲート失敗ではなく警告に降格したもの。
 * GITHUB_STEP_SUMMARY へ「要人間レビュー」として一覧表示するために集計する。
 */
export type QualityGateWarning = {
	id: string;
	regressedMetrics: string[];
};

export type QualityBaseline = {
	version: number;
	commit: string;
	cases: QualityBaselineCase[];
};

/** レポートへ書き出した画像 1 枚の実寸。 */
export type QualityImageSize = {
	width: number;
	height: number;
};

export type QualityCaseFiles = {
	/** 目標画像。登録のない auto ケースでは存在しない。 */
	groundTruth: string | null;
	input: string;
	baseline: string | null;
	result: string;
	/** 目標との差分。目標がないケースでは存在しない。 */
	diff: string | null;
	baselineDiff: string | null;
	backgroundMask: string;
};

export type QualityCaseResult = {
	id: string;
	featureIds: string[];
	parameterMode: QualityParameterMode;
	inputKind: string;
	degradationPatterns: string[];
	status: "passed" | "failed";
	/** 一覧で主判定として表示する、固定目標に対する品質状態。 */
	targetStatus: QualityTargetStatus;
	/** 固定目標の合格条件を満たさなかった項目。 */
	targetFailedAssertions: string[];
	/** auto ケースでは目標元の explicit ケースから引き継いだ合格条件。 */
	targetExpectation: QualityExpectation | null;
	changeStatus: QualityChangeStatus;
	failedAssertions: string[];
	regressedMetrics: string[];
	improvedMetrics: string[];
	changedPixelCount: number | null;
	changedPixelRate: number | null;
	diffBoundingBox: {
		x: number;
		y: number;
		width: number;
		height: number;
	} | null;
	classification: string;
	route: string;
	classificationConfidence: number | null;
	confidence: number | null;
	/** confidence の意味を明示するためのグリッド信頼度。confidence と同値で保持する。 */
	gridConfidence: number | null;
	warnings: string[];
	candidateSuggestionDecision: CandidateSuggestionDecision;
	candidateSuggestionReason: CandidateSuggestionReason;
	warningPresentation: WarningPresentation;
	/**
	 * 品質レポートでは実際のプレビューではなく、候補プラン数を表示見込みの根拠に使う。
	 * アプリが実出力を見て落とす分があるため、実際に並ぶ枚数の上限にあたる。
	 */
	candidatePlanCount: number;
	/** 候補リストが出る見込みのケースだけ生成する選択肢。それ以外は空配列。 */
	candidateOptions: QualityCandidateOption[];
	expectedWidth: number;
	expectedHeight: number;
	gridCandidates: Array<{
		width: number | null;
		height: number | null;
		score: number;
		confidence: number;
	}>;
	expectation: QualityExpectation;
	options: ProcessOptions & {
		sharedPalette?: QualityImageCase["sharedPalette"];
	};
	metrics: QualityMetrics;
	baselineMetrics: QualityBaselineCase | null;
	/** 目標画像を登録していないケースは null。 */
	targetMetrics: QualityTargetMetrics | null;
	/**
	 * 目標画像の由来。auto ケースは目標を借りた explicit ケースの ID を持つ。
	 * explicit ケースはケース定義の正解画像そのものが目標なので null。
	 */
	targetSource: string | null;
	files: QualityCaseFiles;
	/**
	 * レポートへ書き出した各画像の実寸。存在しない画像は null。
	 * [Intended] files と同じキーで持ち、画像とサイズの対応をキー名だけで辿れるようにする。
	 * null 許容も files に合わせる。常に書き出す画像の寸法を入れ忘れたときに、
	 * 型検査を通り抜けてレポートから寸法が黙って消えることを防ぐ。
	 */
	imageSizes: {
		[Key in keyof QualityCaseFiles]: null extends QualityCaseFiles[Key]
			? QualityImageSize | null
			: QualityImageSize;
	};
};

export type QualityResults = {
	metadata: QualityMetadata;
	summary: {
		caseCount: number;
		passed: number;
		failed: number;
		changed: number;
		unchanged: number;
		newCases: number;
		/** オプション指定ありのケース数 */
		explicitCases: number;
		/** 自動判定（UI 既定のみ）のケース数 */
		autoCases: number;
		/** 固定目標の合格条件を満たしたケース数 */
		targetMet: number;
		/** 固定目標の合格条件を満たしていないケース数 */
		targetUnmet: number;
		/** 目標画像または合格条件を登録していないケース数 */
		targetMissing: number;
		/**
		 * 自身の出力とは別の基準画像と比べられたケース数。
		 * 以下の基準依存の集計は、このケースだけを母数にする（0 件なら null）。
		 */
		comparableCases: number;
		top1SizeAccuracy: number | null;
		top3SizeAccuracy: number | null;
		confidenceCorrectnessCorrelation: number | null;
		byteIdentityRate: number;
		catastrophicFailureRate: number | null;
		meanRgbaError: number | null;
		meanRuntimeMs: number;
		approxPeakBytes: number;
	};
	cases: QualityCaseResult[];
};
