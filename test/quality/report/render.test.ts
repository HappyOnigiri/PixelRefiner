import { describe, expect, it } from "vitest";
import type { QualityCaseResult, QualityResults } from "../types";
import { renderCaseDetailHtml, renderHtml } from "./render";

const CASE_ID = "restore-bilinear-to-8x8";

const makeCaseResult = (
	overrides: Partial<QualityCaseResult> = {},
): QualityCaseResult => ({
	id: CASE_ID,
	featureIds: ["PRF-001"],
	parameterMode: "explicit",
	inputKind: "pixel-art",
	degradationPatterns: ["bilinear-blur"],
	status: "passed",
	targetStatus: "unmet",
	targetFailedAssertions: ["mean-rgba-error"],
	targetExpectation: null,
	changeStatus: "unchanged",
	failedAssertions: [],
	regressedMetrics: [],
	improvedMetrics: [],
	changedPixelCount: 12,
	changedPixelRate: 0.05,
	diffBoundingBox: null,
	classification: "pixel-art",
	route: "refine",
	confidence: 0.5,
	warnings: [],
	expectedWidth: 8,
	expectedHeight: 8,
	gridCandidates: [],
	expectation: {},
	options: {},
	metrics: {
		outputWidth: 8,
		outputHeight: 8,
		sizeCorrect: true,
		top3SizeCorrect: true,
		gridPhaseError: 0,
		meanRgbaError: 1.5,
		edgeF1: 0.9,
		backgroundMaskIou: 0.8,
		smallComponentRetention: 1,
		byteIdentical: false,
		catastrophicFailure: false,
		runtimeMs: 12.345,
		approxPeakBytes: 1024,
	},
	baselineMetrics: null,
	targetMetrics: {
		targetWidth: 8,
		targetHeight: 8,
		sizeMatches: true,
		exactMatch: false,
		meanRgbaError: 1.5,
		edgeF1: 0.9,
		backgroundMaskIou: 0.8,
		smallComponentRetention: 1,
	},
	targetSource: null,
	files: {
		groundTruth: `cases/${CASE_ID}/ground-truth.png`,
		input: `cases/${CASE_ID}/input.png`,
		baseline: null,
		result: `cases/${CASE_ID}/result.png`,
		diff: `cases/${CASE_ID}/diff.png`,
		baselineDiff: null,
		backgroundMask: `cases/${CASE_ID}/background-mask.png`,
	},
	...overrides,
});

const makeResults = (cases: QualityCaseResult[]): QualityResults => ({
	metadata: {
		repositoryUrl: "https://example.test/repo",
		prNumber: "local",
		headCommit: "local",
		baseCommit: "local",
		generatedAt: "2026-08-11T04:25:51.000Z",
		workflowRunUrl: "local",
		benchmarkVersion: "2",
		reportVersion: "4",
		baselineCommit: "local",
	},
	summary: {
		caseCount: cases.length,
		passed: cases.length,
		failed: 0,
		changed: 0,
		unchanged: cases.length,
		newCases: 0,
		explicitCases: cases.length,
		autoCases: 0,
		targetMet: 0,
		targetUnmet: cases.length,
		targetMissing: 0,
		top1SizeAccuracy: 1,
		top3SizeAccuracy: 1,
		confidenceCorrectnessCorrelation: null,
		byteIdentityRate: 0,
		catastrophicFailureRate: 0,
		meanRgbaError: 1.5,
		meanRuntimeMs: 12.345,
		approxPeakBytes: 1024,
	},
	cases,
});

const between = (html: string, start: string, end: string): string => {
	const startIndex = html.indexOf(start);
	expect(startIndex).toBeGreaterThan(-1);
	return html.slice(startIndex, html.indexOf(end, startIndex));
};

const badges = (
	html: string,
): Array<{ className: string; translationKey: string }> =>
	[...html.matchAll(/class="badge ([^"]+)"\s+data-i18n="([^"]+)"/g)].map(
		(match) => ({ className: match[1], translationKey: match[2] }),
	);

describe("quality report case detail", () => {
	// [Intended] 一覧と詳細で同じケースの見出しバッジが食い違うと、片方でしか
	// 分からない属性が生まれる。両方の見出しを同じ形で突き合わせる。
	it("shows the same heading badges as the index card", () => {
		const result = makeCaseResult();
		const indexHeading = between(
			renderHtml(makeResults([result])),
			"<h2>",
			"</h2>",
		);
		const detailHeading = between(
			renderCaseDetailHtml(result),
			"<h1>",
			"</h1>",
		);
		expect(badges(indexHeading)).toEqual([
			{ className: "target-unmet", translationKey: "targetUnmet" },
			{ className: "unchanged", translationKey: "unchanged" },
			{ className: "parameter-explicit", translationKey: "explicitParameters" },
		]);
		expect(badges(detailHeading)).toEqual(badges(indexHeading));
	});

	it("marks an auto case with the auto parameter badge", () => {
		const detailHeading = between(
			renderCaseDetailHtml(makeCaseResult({ parameterMode: "auto" })),
			"<h1>",
			"</h1>",
		);
		expect(badges(detailHeading)).toContainEqual({
			className: "parameter-auto",
			translationKey: "autoParameters",
		});
	});

	// [Intended] 実行時間はベースラインを持たないので、比較列のある指標テーブルには
	// 出さない。表へ紛れ込むと毎回「判定不能」の行が増える。
	it("shows the processing time outside the metric table", () => {
		const detail = renderCaseDetailHtml(makeCaseResult());
		expect(detail).toContain(
			'<strong data-i18n="processingTime">Time</strong>: 12.35ms',
		);
		expect(between(detail, "<tbody>", "</tbody>")).not.toContain(
			"processingTime",
		);
	});

	// [Intended] failed は「ケース定義の許容値を満たさない」を指す別概念なので、
	// 目標未達の見出しには使わない。
	it("labels unmet target assertions with the target verdict key", () => {
		const result = makeCaseResult();
		const targetSection = between(
			renderCaseDetailHtml(result),
			'<h2 data-i18n="targetComparison">',
			"</section>",
		);
		expect(targetSection).toContain(
			'<strong data-i18n="targetUnmet">Target unmet</strong>',
		);
		expect(targetSection).not.toContain('data-i18n="failed"');
		expect(renderHtml(makeResults([result]))).toContain(
			'<p class="target-failures"><strong data-i18n="targetUnmet">',
		);
	});
});
