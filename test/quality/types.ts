import type { ProcessOptions } from "../../src/core/processor";

export const QUALITY_REPORT_VERSION = "2";
export const QUALITY_BENCHMARK_VERSION = "2";
export const QUALITY_BASELINE_VERSION = 3;

export type QualityChangeStatus =
	| "improved"
	| "regressed"
	| "changed"
	| "unchanged"
	| "new";

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

export type QualityImageCase = {
	id: string;
	featureIds: string[];
	optionNames?: string[];
	profile: "smoke" | "full";
	inputKind: string;
	degradationPatterns: string[];
	options: ProcessOptions;
	input: string;
	expected: string;
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

export type QualityBaseline = {
	version: number;
	commit: string;
	cases: QualityBaselineCase[];
};

export type QualityCaseResult = {
	id: string;
	featureIds: string[];
	inputKind: string;
	degradationPatterns: string[];
	status: "passed" | "failed";
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
	confidence: number | null;
	warnings: string[];
	expectedWidth: number;
	expectedHeight: number;
	gridCandidates: Array<{
		width: number | null;
		height: number | null;
		score: number;
		confidence: number;
	}>;
	expectation: QualityExpectation;
	options: ProcessOptions;
	metrics: QualityMetrics;
	baselineMetrics: QualityBaselineCase | null;
	files: {
		groundTruth: string;
		input: string;
		baseline: string | null;
		result: string;
		diff: string;
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
