import type {
	CandidateModalDecision,
	CandidateModalReason,
	WarningPresentation,
} from "../../src/core/candidate-modal-decision";
import type { ProcessOptions } from "../../src/core/processor";
import type { DitherMode } from "../../src/shared/types";

export const QUALITY_REPORT_VERSION = "4";
export const QUALITY_BENCHMARK_VERSION = "2";
export const QUALITY_BASELINE_VERSION = 3;

export type QualityChangeStatus =
	| "improved"
	| "regressed"
	| "changed"
	| "unchanged"
	| "new";

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

export type QualityMetadata = {
	repositoryUrl: string;
	prNumber: string;
	headCommit: string;
	baseCommit: string;
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
	candidateModalDecision: CandidateModalDecision;
	candidateModalReason: CandidateModalReason;
	warningPresentation: WarningPresentation;
	/** 品質レポートでは実際のプレビューではなく、候補プラン数を表示見込みの根拠に使う。 */
	candidatePlanCount: number;
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
	files: {
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
};

export type QualityResults = {
	metadata: QualityMetadata;
	summary: {
		caseCount: number;
		passed: number;
		failed: number;
		changed: number;
		improved: number;
		regressed: number;
		unchanged: number;
		newCases: number;
		blockingFailures: number;
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
		top1SizeAccuracy: number;
		top3SizeAccuracy: number;
		confidenceCorrectnessCorrelation: number | null;
		byteIdentityRate: number;
		catastrophicFailureRate: number;
		meanRgbaError: number;
		meanRuntimeMs: number;
		approxPeakBytes: number;
	};
	cases: QualityCaseResult[];
};
