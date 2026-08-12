import { describe, expect, it } from "vitest";
import type { QualityCaseResult, QualityResults } from "../types";
import { renderCaseDetailHtml, renderHtml, renderMarkdown } from "./render";

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
	classificationConfidence: 0.5,
	confidence: 0.5,
	gridConfidence: 0.5,
	warnings: [],
	// [Intended] explicit ケースなので候補選択モーダルは対象外になる。
	// evaluateCandidateModalDecision が isAuto=false に対して返す組み合わせと揃える。
	candidateModalDecision: "not-applicable",
	candidateModalReason: "NOT_AUTO",
	warningPresentation: "none",
	candidatePlanCount: 0,
	candidateOptions: [],
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
	baselineMetrics: {
		id: CASE_ID,
		status: "passed",
		outputWidth: 8,
		outputHeight: 8,
		meanRgbaError: 1.6,
		edgeF1: 0.88,
		backgroundMaskIou: 0.8,
		smallComponentRetention: 1,
		catastrophicFailure: false,
	},
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
		baseline: `cases/${CASE_ID}/baseline.png`,
		result: `cases/${CASE_ID}/result.png`,
		diff: `cases/${CASE_ID}/diff.png`,
		baselineDiff: `cases/${CASE_ID}/baseline-diff.png`,
		backgroundMask: `cases/${CASE_ID}/background-mask.png`,
	},
	imageSizes: {
		groundTruth: { width: 8, height: 8 },
		input: { width: 64, height: 64 },
		baseline: { width: 8, height: 8 },
		result: { width: 8, height: 8 },
		diff: { width: 8, height: 8 },
		baselineDiff: { width: 8, height: 8 },
		backgroundMask: { width: 8, height: 8 },
	},
	...overrides,
});

/** 前回生成を取得できなかったレポートのケース結果。 */
const makeCaseResultWithoutPreviousRun = (): QualityCaseResult => {
	const result = makeCaseResult({
		changeStatus: "new",
		changedPixelCount: null,
		changedPixelRate: null,
		baselineMetrics: null,
	});
	return {
		...result,
		files: { ...result.files, baseline: null, baselineDiff: null },
		imageSizes: { ...result.imageSizes, baseline: null, baselineDiff: null },
	};
};

const makeResults = (cases: QualityCaseResult[]): QualityResults => ({
	metadata: {
		repositoryUrl: "https://example.test/repo",
		kind: "local",
		prNumber: "local",
		headCommit: "local",
		baseCommit: "local",
		previousVersion: null,
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
		comparableCases: cases.length,
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
	it("places the theme toggle last in the index sidebar only", () => {
		const result = makeCaseResult();
		const index = renderHtml(makeResults([result]));
		const sidebar = between(index, '<aside class="sidebar">', "</aside>");
		expect(sidebar).toContain("data-theme-toggle");
		expect(sidebar.indexOf("data-theme-toggle")).toBeGreaterThan(
			sidebar.indexOf('data-i18n="language"'),
		);
		const detailBody = between(
			renderCaseDetailHtml(result, true),
			"<body>",
			"<script>",
		);
		expect(detailBody).not.toContain("data-theme-toggle");
	});

	it("runs the theme bootstrap before report styles are parsed", () => {
		for (const html of [
			renderHtml(makeResults([makeCaseResult()])),
			renderCaseDetailHtml(makeCaseResult(), true),
		]) {
			expect(html.indexOf("pixel-refiner-theme")).toBeGreaterThan(-1);
			expect(html.indexOf("pixel-refiner-theme")).toBeLessThan(
				html.indexOf("<style>"),
			);
		}
	});

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
			renderCaseDetailHtml(result, true),
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
			renderCaseDetailHtml(makeCaseResult({ parameterMode: "auto" }), true),
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
		const detail = renderCaseDetailHtml(makeCaseResult(), true);
		expect(detail).toContain(
			'<strong data-i18n="processingTime">Time</strong>: 12.35ms',
		);
		expect(between(detail, "<tbody>", "</tbody>")).not.toContain(
			"processingTime",
		);
	});

	// [Intended] 画像の寸法は一覧でも詳細でも同じ形で読めるようにする。片方にしか無いと、
	// 目標と出力の食い違いに気付くために毎回詳細を開くことになる。
	it("shows each image size next to its caption in both views", () => {
		const result = makeCaseResult();
		expect(renderHtml(makeResults([result]))).toContain(
			'<span data-i18n="result">Result</span> <small class="image-size">(8x8px)</small>',
		);
		expect(renderCaseDetailHtml(result, true)).toContain(
			'<span data-i18n="input">Input</span> <small class="image-size">(64x64px)</small>',
		);
	});

	// [Intended] 翻訳は data-i18n の要素の textContent を丸ごと置き換えるので、実寸を
	// figcaption 直下へ置くと言語切り替えで消える。見出しは span に閉じ込める。
	it("keeps the image size outside the translated caption element", () => {
		const result = makeCaseResult();
		expect(renderHtml(makeResults([result]))).not.toContain(
			"<figcaption data-i18n=",
		);
		expect(renderCaseDetailHtml(result, true)).not.toContain(
			"<figcaption data-i18n=",
		);
	});

	it("highlights the current-run size when it differs from the target", () => {
		const result = makeCaseResult({
			targetMetrics: {
				targetWidth: 8,
				targetHeight: 8,
				sizeMatches: false,
				exactMatch: false,
				meanRgbaError: 1.5,
				edgeF1: 0,
				backgroundMaskIou: 0,
				smallComponentRetention: 0,
			},
			imageSizes: {
				groundTruth: { width: 8, height: 8 },
				input: { width: 64, height: 64 },
				baseline: null,
				result: { width: 16, height: 16 },
				diff: { width: 16, height: 16 },
				baselineDiff: null,
				backgroundMask: { width: 16, height: 16 },
			},
		});
		for (const html of [
			renderHtml(makeResults([result])),
			renderCaseDetailHtml(result, true),
		]) {
			expect(html).toContain(
				'<span data-i18n="result">Result</span> <small class="image-size size-mismatch">(16x16px)</small>',
			);
			expect(html).toContain('<small class="image-size">(8x8px)</small>');
		}
	});

	// [Intended] 目標を持たないケースは寸法を比べられないので、警告色にはしない。
	it("does not highlight the current-run size without a target image", () => {
		const result = makeCaseResult({
			targetMetrics: null,
			files: {
				groundTruth: null,
				input: `cases/${CASE_ID}/input.png`,
				baseline: null,
				result: `cases/${CASE_ID}/result.png`,
				diff: null,
				baselineDiff: null,
				backgroundMask: `cases/${CASE_ID}/background-mask.png`,
			},
			imageSizes: {
				groundTruth: null,
				input: { width: 64, height: 64 },
				baseline: null,
				result: { width: 16, height: 16 },
				diff: null,
				baselineDiff: null,
				backgroundMask: { width: 16, height: 16 },
			},
		});
		expect(renderCaseDetailHtml(result, true)).not.toContain(
			'<small class="image-size size-mismatch">',
		);
	});

	// [Intended] failed は「ケース定義の許容値を満たさない」を指す別概念なので、
	// 目標未達の見出しには使わない。
	it("labels unmet target assertions with the target verdict key", () => {
		const result = makeCaseResult();
		const targetSection = between(
			renderCaseDetailHtml(result, true),
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

// [Intended] 前回生成を取得できないレポートでは、全ケースが "new" になり前回基準の
// 指標も無い。欄だけ残すと、比較できなかったのか差が無かったのかを読み分けられない。
describe("quality report without a previous run", () => {
	const withoutPreviousRun = (): QualityResults =>
		makeResults([makeCaseResultWithoutPreviousRun()]);

	it("drops the change filter and its badge from the index", () => {
		const index = renderHtml(withoutPreviousRun());
		// CSS には絞り込みボタンの規則が残るので、サイドバーの本文だけを見る。
		const sidebar = between(index, '<aside class="sidebar">', "</aside>");
		expect(sidebar).not.toContain("data-change-filter");
		expect(sidebar).not.toContain('data-i18n="changeStatus"');
		expect(sidebar).not.toContain('id="active-change-label"');
		expect(index).not.toContain("data-change=");
		expect(badges(between(index, "<h2>", "</h2>"))).toEqual([
			{ className: "target-unmet", translationKey: "targetUnmet" },
			{ className: "parameter-explicit", translationKey: "explicitParameters" },
		]);
	});

	it("explains in the sidebar why the comparison is missing", () => {
		const index = renderHtml(withoutPreviousRun());
		expect(index).toContain('data-i18n="previousRunUnavailable"');
		expect(renderHtml(makeResults([makeCaseResult()]))).not.toContain(
			'data-i18n="previousRunUnavailable"',
		);
	});

	it("drops the previous-run columns from the metric table", () => {
		const detail = renderCaseDetailHtml(
			makeCaseResultWithoutPreviousRun(),
			false,
		);
		expect(detail).not.toContain('data-i18n="baseline"');
		expect(detail).not.toContain('data-i18n="delta"');
		expect(detail).not.toContain('data-i18n="changedPixels"');
		expect(detail).not.toContain('data-i18n="regressedMetrics"');
		// 出力サイズの判定は前回比較ではないので、判定列そのものは残す。
		expect(detail).toContain('data-i18n="verdict"');
		const headerCells = between(detail, "<thead>", "</thead>").match(/<th /g);
		const firstRow = between(detail, "<tbody>", "</tr>");
		expect(headerCells).toHaveLength(4);
		expect(firstRow.match(/<t[hd][ >]/g)).toHaveLength(4);
	});

	it("keeps the markdown columns aligned with its header", () => {
		const markdown = renderMarkdown(withoutPreviousRun());
		expect(markdown).not.toContain("Change from previous run");
		expect(markdown).not.toContain("- New:");
		const [header, alignment, row] = markdown
			.split("\n")
			.filter((line) => line.startsWith("|"));
		const cells = (line: string): number => line.split("|").length;
		expect(cells(header)).toBe(cells(alignment));
		expect(cells(row)).toBe(cells(alignment));
	});
});

// [Intended] auto ケースの基準はベースライン画像なので、取得できないと指標が自身の
// 出力との比較になり、誤差 0・一致率 1 が並ぶ。値をそのまま出すと完全一致と読める。
describe("quality report without a metric reference", () => {
	const autoCaseWithoutBaseline = (): QualityCaseResult => ({
		...makeCaseResultWithoutPreviousRun(),
		parameterMode: "auto",
	});

	it("hides the metric values measured against the case's own output", () => {
		const detail = renderCaseDetailHtml(autoCaseWithoutBaseline(), false);
		const table = between(detail, "<tbody>", "</table>");
		expect(table).not.toContain(">1.5<");
		expect(table).not.toContain(">0.9<");
		expect(table).toContain('data-i18n="notAvailable"');
		expect(detail).toContain('data-i18n="metricReferenceUnavailable"');
	});

	it("keeps the values of a case that has its own expected image", () => {
		const detail = renderCaseDetailHtml(
			makeCaseResultWithoutPreviousRun(),
			false,
		);
		const table = between(detail, "<tbody>", "</table>");
		expect(table).toContain(">1.5<");
		expect(table).toContain('data-i18n="passed"');
		expect(detail).not.toContain('data-i18n="metricReferenceUnavailable"');
	});

	it("narrows the markdown summary to the cases with a reference output", () => {
		const results = makeResults([autoCaseWithoutBaseline(), makeCaseResult()]);
		const markdown = renderMarkdown({
			...results,
			summary: { ...results.summary, comparableCases: 1 },
		});
		expect(markdown).toContain(
			"- Top-1 size accuracy: 100.0% (1 of 2 cases with a reference output)",
		);
		expect(renderMarkdown(results)).toContain("- Top-1 size accuracy: 100.0%\n");
	});

	it("reports the reference-dependent summary as n/a when nothing is comparable", () => {
		const results = makeResults([autoCaseWithoutBaseline()]);
		const markdown = renderMarkdown({
			...results,
			summary: {
				...results.summary,
				comparableCases: 0,
				top1SizeAccuracy: null,
				top3SizeAccuracy: null,
				catastrophicFailureRate: null,
				meanRgbaError: null,
			},
		});
		expect(markdown).toContain(
			"- Top-1 size accuracy: n/a (0 of 1 cases with a reference output)",
		);
		expect(markdown).toContain("- Catastrophic failure rate: n/a");
	});
});

describe("quality report for a release", () => {
	const releaseResults = (previousVersion: string | null): QualityResults => {
		const results = makeResults([makeCaseResult()]);
		return {
			...results,
			metadata: {
				...results.metadata,
				kind: "release",
				headCommit: "1234567890abcdef",
				previousVersion,
				workflowRunUrl: "https://example.test/repo/actions/runs/123",
			},
		};
	};

	it("links the release tag the previous run came from", () => {
		const index = renderHtml(releaseResults("v1.1.2"));
		expect(index).toContain('data-i18n="releaseReport"');
		expect(index).toContain('data-i18n="previousVersion"');
		expect(index).toContain(
			'href="https://example.test/repo/releases/tag/v1.1.2"',
		);
		expect(index).not.toContain('data-i18n="pullRequest"');
		expect(index).not.toContain('data-i18n="baseCommit"');
	});

	it("omits the previous version when no release tag was found", () => {
		const index = renderHtml(releaseResults(null));
		expect(index).toContain('data-i18n="releaseReport"');
		expect(index).not.toContain('data-i18n="previousVersion"');
	});
});
