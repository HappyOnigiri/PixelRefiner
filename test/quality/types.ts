import type { ProcessOptions } from "../../src/core/processor";

export const QUALITY_REPORT_VERSION = "1";
export const QUALITY_BENCHMARK_VERSION = "1";

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

export type QualityCaseResult = {
	id: string;
	featureIds: string[];
	inputKind: string;
	degradationPatterns: string[];
	status: "passed" | "failed";
	failedAssertions: string[];
	classification: string;
	route: string;
	confidence: number | null;
	warnings: string[];
	gridCandidates: Array<{
		width: number | null;
		height: number | null;
		score: number;
	}>;
	options: ProcessOptions;
	metrics: QualityMetrics;
	legacyMetrics: QualityMetrics;
	files: {
		groundTruth: string;
		input: string;
		legacy: string;
		result: string;
		diff: string;
		legacyDiff: string;
		backgroundMask: string;
	};
};

export type QualityResults = {
	metadata: QualityMetadata;
	summary: {
		caseCount: number;
		passed: number;
		failed: number;
		top1SizeAccuracy: number;
		top3SizeAccuracy: number;
		byteIdentityRate: number;
		catastrophicFailureRate: number;
		meanRgbaError: number;
		meanRuntimeMs: number;
		approxPeakBytes: number;
	};
	cases: QualityCaseResult[];
};
