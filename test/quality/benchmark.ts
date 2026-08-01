import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { processImage } from "../../src/core/processor";
import { baselineImagePath, loadBaseline } from "./baseline";
import { classifyChange, compareImages, compareMetrics } from "./comparison";
import { imagesEqual, readPng, writePng } from "./image";
import { qualityCaseDirectory } from "./manifest";
import {
	calculateMetrics,
	createBackgroundMaskImage,
	createDiffImage,
} from "./metrics";
import { runQualityReportClient } from "./report/client";
import { DETAIL_REPORT_STYLES, INDEX_REPORT_STYLES } from "./report/styles";
import type {
	QualityCaseResult,
	QualityImageCase,
	QualityMetadata,
	QualityResults,
} from "./types";
import { QUALITY_BENCHMARK_VERSION, QUALITY_REPORT_VERSION } from "./types";

const REPORT_ROOT = path.resolve("tmp/quality-report/latest");

const metadataFromEnvironment = (): QualityMetadata => {
	const repository =
		process.env.GITHUB_REPOSITORY ?? "HappyOnigiri/PixelRefiner";
	const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
	const runId = process.env.GITHUB_RUN_ID ?? "";
	const baseline = loadBaseline();
	return {
		repositoryUrl: `${server}/${repository}`,
		prNumber: process.env.QUALITY_PR_NUMBER ?? "local",
		headCommit:
			process.env.QUALITY_HEAD_SHA ?? process.env.GITHUB_SHA ?? "local",
		baseCommit: process.env.QUALITY_BASE_SHA ?? "local",
		generatedAt: new Date().toISOString(),
		workflowRunUrl:
			runId === "" ? "local" : `${server}/${repository}/actions/runs/${runId}`,
		benchmarkVersion: QUALITY_BENCHMARK_VERSION,
		reportVersion: QUALITY_REPORT_VERSION,
		baselineCommit: baseline.commit,
	};
};

const failedAssertions = (
	qualityCase: QualityImageCase,
	result: ReturnType<typeof calculateMetrics>,
	actualMatchesExpected: boolean,
): string[] => {
	const failed: string[] = [];
	const expectation = qualityCase.expectation;
	if (expectation.exact && !actualMatchesExpected)
		failed.push("exact-image-match");
	if (
		expectation.maxMeanRgbaError !== undefined &&
		result.meanRgbaError > expectation.maxMeanRgbaError
	) {
		failed.push("mean-rgba-error");
	}
	if (
		expectation.minEdgeF1 !== undefined &&
		result.edgeF1 < expectation.minEdgeF1
	) {
		failed.push("edge-f1");
	}
	if (
		expectation.minBackgroundMaskIou !== undefined &&
		result.backgroundMaskIou < expectation.minBackgroundMaskIou
	) {
		failed.push("background-mask-iou");
	}
	if (
		expectation.minSmallComponentRetention !== undefined &&
		result.smallComponentRetention < expectation.minSmallComponentRetention
	) {
		failed.push("small-component-retention");
	}
	if (!result.sizeCorrect) failed.push("output-size");
	if (
		expectation.expectedWidth !== undefined &&
		result.outputWidth !== expectation.expectedWidth
	) {
		failed.push("expected-width");
	}
	if (
		expectation.expectedHeight !== undefined &&
		result.outputHeight !== expectation.expectedHeight
	) {
		failed.push("expected-height");
	}
	if (!result.byteIdentical) failed.push("deterministic-output");
	if (result.catastrophicFailure) failed.push("catastrophic-failure");
	return failed;
};

export const runQualityCase = (
	qualityCase: QualityImageCase,
	writeArtifacts = false,
): QualityCaseResult => {
	const inputPath = path.resolve(qualityCase.input);
	const expectedPath = path.resolve(qualityCase.expected);
	const input = readPng(inputPath);
	const expected = readPng(expectedPath);
	const options = { ...qualityCase.options, debug: false };

	const start = performance.now();
	const currentRun = processImage(input, options);
	const runtime = performance.now() - start;
	const repeatRun = processImage(input, options);

	const metrics = calculateMetrics(
		currentRun.result,
		input,
		expected,
		currentRun.grid,
		repeatRun.result,
		runtime,
	);
	const failed = failedAssertions(
		qualityCase,
		metrics,
		imagesEqual(currentRun.result, expected),
	);
	const status = failed.length === 0 ? "passed" : "failed";
	const baseline = loadBaseline();
	const baselineMetrics =
		baseline.cases.find((baselineCase) => baselineCase.id === qualityCase.id) ??
		null;
	const storedBaselinePath = baselineImagePath(qualityCase.id);
	const baselineImage = existsSync(storedBaselinePath)
		? readPng(storedBaselinePath)
		: null;
	const imageComparison = compareImages(currentRun.result, baselineImage);
	const metricComparison = compareMetrics(metrics, baselineMetrics, status);
	const changeStatus = classifyChange(
		baselineImage !== null,
		imageComparison.changed,
		metricComparison.regressed,
		metricComparison.improved,
	);
	const caseDirectory = qualityCaseDirectory(qualityCase.id);
	const files = {
		groundTruth: `${caseDirectory}/ground-truth.png`,
		input: `${caseDirectory}/input.png`,
		baseline: baselineImage === null ? null : `${caseDirectory}/baseline.png`,
		result: `${caseDirectory}/result.png`,
		diff: `${caseDirectory}/diff.png`,
		baselineDiff:
			baselineImage === null ? null : `${caseDirectory}/baseline-diff.png`,
		backgroundMask: `${caseDirectory}/background-mask.png`,
	};
	const selectedCandidate =
		currentRun.analysis.gridCandidates[
			currentRun.analysis.selectedCandidateIndex ?? 0
		];
	const rankedCandidates = [...currentRun.analysis.gridCandidates].sort(
		(left, right) => right.totalScore - left.totalScore,
	);
	let topCandidates = rankedCandidates.slice(0, 3);
	if (selectedCandidate && !topCandidates.includes(selectedCandidate)) {
		topCandidates = [...topCandidates.slice(0, 2), selectedCandidate].sort(
			(left, right) => right.totalScore - left.totalScore,
		);
	}
	if (writeArtifacts) {
		const outputDirectory = path.join(REPORT_ROOT, caseDirectory);
		mkdirSync(outputDirectory, { recursive: true });
		cpSync(expectedPath, path.join(REPORT_ROOT, files.groundTruth));
		cpSync(inputPath, path.join(REPORT_ROOT, files.input));
		if (files.baseline && baselineImage) {
			writePng(path.join(REPORT_ROOT, files.baseline), baselineImage);
		}
		writePng(path.join(REPORT_ROOT, files.result), currentRun.result);
		writePng(
			path.join(REPORT_ROOT, files.diff),
			createDiffImage(currentRun.result, expected),
		);
		if (files.baselineDiff && baselineImage) {
			writePng(
				path.join(REPORT_ROOT, files.baselineDiff),
				createDiffImage(currentRun.result, baselineImage),
			);
		}
		writePng(
			path.join(REPORT_ROOT, files.backgroundMask),
			createBackgroundMaskImage(currentRun.result),
		);
	}
	return {
		id: qualityCase.id,
		featureIds: qualityCase.featureIds,
		inputKind: qualityCase.inputKind,
		degradationPatterns: qualityCase.degradationPatterns,
		status,
		changeStatus,
		failedAssertions: failed,
		regressedMetrics: metricComparison.regressed,
		improvedMetrics: metricComparison.improved,
		changedPixelCount: imageComparison.changedPixelCount,
		changedPixelRate: imageComparison.changedPixelRate,
		diffBoundingBox: imageComparison.diffBoundingBox,
		classification: currentRun.analysis.classification ?? qualityCase.inputKind,
		route: currentRun.analysis.route,
		confidence: currentRun.analysis.confidence,
		warnings: currentRun.analysis.warnings,
		expectedWidth: expected.width,
		expectedHeight: expected.height,
		gridCandidates: topCandidates.map((candidate) => ({
			width: candidate.outW,
			height: candidate.outH,
			score: candidate.totalScore,
			confidence: candidate.confidence,
		})),
		expectation: qualityCase.expectation,
		options: qualityCase.options,
		metrics,
		baselineMetrics,
		files,
	};
};

export const writeQualityBaselineImage = (
	qualityCase: QualityImageCase,
	outputPath: string,
): void => {
	const input = readPng(path.resolve(qualityCase.input));
	const options = { ...qualityCase.options, debug: false };
	writePng(outputPath, processImage(input, options).result);
};

const summarize = (cases: QualityCaseResult[]): QualityResults["summary"] => {
	const count = cases.length;
	const average = (select: (result: QualityCaseResult) => number): number => {
		let total = 0;
		for (const result of cases) total += select(result);
		return count === 0 ? 0 : total / count;
	};
	const confidenceSamples = cases.flatMap((result) =>
		result.gridCandidates.map((candidate) => ({
			confidence: candidate.confidence,
			correct: Number(
				candidate.width === result.expectedWidth &&
					candidate.height === result.expectedHeight,
			),
		})),
	);
	const sampleCount = confidenceSamples.length;
	let confidenceTotal = 0;
	let correctnessTotal = 0;
	for (const sample of confidenceSamples) {
		confidenceTotal += sample.confidence;
		correctnessTotal += sample.correct;
	}
	const meanConfidence = sampleCount === 0 ? 0 : confidenceTotal / sampleCount;
	const meanCorrectness =
		sampleCount === 0 ? 0 : correctnessTotal / sampleCount;
	let covariance = 0;
	let confidenceVariance = 0;
	let correctnessVariance = 0;
	for (const sample of confidenceSamples) {
		const confidenceDelta = sample.confidence - meanConfidence;
		const correctnessDelta = sample.correct - meanCorrectness;
		covariance += confidenceDelta * correctnessDelta;
		confidenceVariance += confidenceDelta * confidenceDelta;
		correctnessVariance += correctnessDelta * correctnessDelta;
	}
	const correlationDenominator = Math.sqrt(
		confidenceVariance * correctnessVariance,
	);
	return {
		caseCount: count,
		passed: cases.filter((result) => result.status === "passed").length,
		failed: cases.filter((result) => result.status === "failed").length,
		changed: cases.filter((result) => result.changeStatus !== "unchanged")
			.length,
		improved: cases.filter((result) => result.changeStatus === "improved")
			.length,
		regressed: cases.filter((result) => result.changeStatus === "regressed")
			.length,
		unchanged: cases.filter((result) => result.changeStatus === "unchanged")
			.length,
		newCases: cases.filter((result) => result.changeStatus === "new").length,
		blockingFailures: cases.filter(
			(result) =>
				result.changeStatus === "regressed" ||
				(result.changeStatus === "new" && result.status === "failed"),
		).length,
		top1SizeAccuracy: average((result) => Number(result.metrics.sizeCorrect)),
		top3SizeAccuracy: average((result) =>
			Number(result.metrics.top3SizeCorrect),
		),
		confidenceCorrectnessCorrelation:
			correlationDenominator === 0 ? null : covariance / correlationDenominator,
		byteIdentityRate: average((result) => Number(result.metrics.byteIdentical)),
		catastrophicFailureRate: average((result) =>
			Number(result.metrics.catastrophicFailure),
		),
		meanRgbaError: average((result) => result.metrics.meanRgbaError),
		meanRuntimeMs: average((result) => result.metrics.runtimeMs),
		approxPeakBytes: Math.max(
			0,
			...cases.map((result) => result.metrics.approxPeakBytes),
		),
	};
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const REPORT_TRANSLATIONS = {
	en: {
		title: "PixelRefiner quality report",
		groundTruth: "Ground truth",
		input: "Input",
		baseline: "Baseline",
		result: "Result",
		groundTruthDifference: "Ground-truth difference",
		baselineDifference: "Baseline difference",
		backgroundMask: "Background mask",
		inputKind: "Input kind",
		route: "Route",
		confidence: "Confidence (diagnostic)",
		notAvailable: "not available",
		warnings: "Warnings",
		none: "none",
		topCandidates: "Top candidates",
		metrics: "Metrics",
		options: "Options",
		filterCases: "Filter cases",
		language: "Language",
		allStatuses: "All",
		passed: "passed",
		failed: "target unmet",
		preserve: "preserve",
		refine: "refine",
		workflow: "workflow",
		changed: "changed from base branch",
		improved: "improved from base branch",
		regressed: "regressed from base branch",
		unchanged: "unchanged from base branch",
		new: "new case not in base branch",
		changedCases: "Cases with differences",
		allChanges: "All",
		qualityStatus: "Quality status",
		changeStatus: "Change status",
		reportDetails: "Report details",
		pullRequest: "Pull request",
		headCommit: "Head",
		baseCommit: "PR base",
		baselineCommit: "Baseline snapshot",
		generatedAt: "Generated",
		displayConditions: "Showing",
		casesShown: "cases",
		changedPixels: "Changed pixels",
		comparison: "Metric comparison",
		metric: "Metric",
		target: "Target",
		current: "Current",
		delta: "Delta",
		verdict: "Verdict",
		outputSize: "Output size",
		meanRgbaError: "Mean RGBA error",
		meanRgbaErrorShort: "Error",
		processingTime: "Time",
		exactMatch: "Exact match",
		exactMatchShort: "Exact",
		yes: "yes",
		no: "no",
		edgeF1: "Edge F1",
		backgroundMaskIou: "Background mask IoU",
		smallComponentRetention: "Small component retention",
		diagnostics: "All images and settings",
		details: "Details",
		backToReport: "Back to report",
		noRegression: "No new quality regression",
		hasRegression: "Quality regression detected",
		assertions: {
			"exact-image-match": "exact image match",
			"mean-rgba-error": "mean RGBA error",
			"edge-f1": "edge retention",
			"background-mask-iou": "background mask",
			"small-component-retention": "small component retention",
			"expected-width": "expected width",
			"expected-height": "expected height",
			"deterministic-output": "deterministic output",
			"catastrophic-failure": "catastrophic failure",
			"output-size": "output size",
		},
	},
	ja: {
		title: "品質レポート",
		groundTruth: "期待結果",
		input: "入力",
		baseline: "基準結果",
		result: "処理結果",
		groundTruthDifference: "期待結果との差分",
		baselineDifference: "基準結果との差分",
		backgroundMask: "背景マスク",
		inputKind: "入力種別",
		route: "処理ルート",
		confidence: "信頼度（診断値）",
		notAvailable: "取得不可",
		warnings: "警告",
		none: "なし",
		topCandidates: "上位候補",
		metrics: "評価指標",
		options: "処理設定",
		filterCases: "ケースを絞り込む",
		language: "表示言語",
		allStatuses: "すべて",
		passed: "合格",
		failed: "目標未達",
		preserve: "保持",
		refine: "復元",
		workflow: "実行ログ",
		changed: "base branchから変更",
		improved: "base branchより改善",
		regressed: "base branchより悪化",
		unchanged: "base branchと差分なし",
		new: "base branchにない新規ケース",
		changedCases: "差分あり",
		allChanges: "すべて",
		qualityStatus: "品質状態",
		changeStatus: "変化状態",
		reportDetails: "レポート情報",
		pullRequest: "プルリクエスト",
		headCommit: "HEAD",
		baseCommit: "PRのベース",
		baselineCommit: "比較基準",
		generatedAt: "生成日時",
		displayConditions: "表示条件",
		casesShown: "件",
		changedPixels: "変更画素",
		comparison: "指標の比較",
		metric: "指標",
		target: "合格条件",
		current: "今回",
		delta: "変化量",
		verdict: "判定",
		outputSize: "出力サイズ",
		meanRgbaError: "RGBA平均誤差",
		meanRgbaErrorShort: "誤差",
		processingTime: "時間",
		exactMatch: "完全一致",
		exactMatchShort: "一致",
		yes: "はい",
		no: "いいえ",
		edgeF1: "輪郭F1",
		backgroundMaskIou: "背景マスクIoU",
		smallComponentRetention: "小要素保持率",
		diagnostics: "すべての画像と処理設定",
		details: "詳細",
		backToReport: "レポートに戻る",
		noRegression: "新たな品質悪化はありません",
		hasRegression: "品質の悪化を検出しました",
		assertions: {
			"exact-image-match": "画像の完全一致",
			"mean-rgba-error": "RGBA平均誤差",
			"edge-f1": "輪郭の保持",
			"background-mask-iou": "背景マスク",
			"small-component-retention": "小要素の保持",
			"expected-width": "期待する幅",
			"expected-height": "期待する高さ",
			"deterministic-output": "出力の再現性",
			"catastrophic-failure": "致命的な失敗",
			"output-size": "出力サイズ",
		},
	},
	"zh-CN": {
		title: "PixelRefiner 质量报告",
		groundTruth: "预期结果",
		input: "输入",
		baseline: "基准结果",
		result: "处理结果",
		groundTruthDifference: "与预期结果的差异",
		baselineDifference: "与基准结果的差异",
		backgroundMask: "背景蒙版",
		inputKind: "输入类型",
		route: "处理路径",
		confidence: "置信度（诊断值）",
		notAvailable: "不可用",
		warnings: "警告",
		none: "无",
		topCandidates: "候选前三名",
		metrics: "指标",
		options: "处理设置",
		filterCases: "筛选用例",
		language: "显示语言",
		allStatuses: "全部",
		passed: "通过",
		failed: "未达到目标",
		preserve: "保留",
		refine: "优化",
		workflow: "工作流",
		changed: "与基础分支不同",
		improved: "优于基础分支",
		regressed: "劣于基础分支",
		unchanged: "与基础分支相同",
		new: "基础分支中没有的新用例",
		changedCases: "有差异的用例",
		allChanges: "全部",
		qualityStatus: "质量状态",
		changeStatus: "变更状态",
		reportDetails: "报告信息",
		pullRequest: "拉取请求",
		headCommit: "HEAD",
		baseCommit: "PR 基础提交",
		baselineCommit: "比较基准",
		generatedAt: "生成时间",
		displayConditions: "显示条件",
		casesShown: "个用例",
		changedPixels: "变更像素",
		comparison: "指标比较",
		metric: "指标",
		target: "目标",
		current: "当前",
		delta: "变化量",
		verdict: "判定",
		outputSize: "输出尺寸",
		meanRgbaError: "RGBA 平均误差",
		meanRgbaErrorShort: "误差",
		processingTime: "时间",
		exactMatch: "完全匹配",
		exactMatchShort: "匹配",
		yes: "是",
		no: "否",
		edgeF1: "边缘 F1",
		backgroundMaskIou: "背景蒙版 IoU",
		smallComponentRetention: "小组件保留率",
		diagnostics: "所有图像和处理设置",
		details: "详情",
		backToReport: "返回报告",
		noRegression: "未发现新的质量下降",
		hasRegression: "检测到质量下降",
		assertions: {
			"exact-image-match": "图像完全匹配",
			"mean-rgba-error": "RGBA 平均误差",
			"edge-f1": "边缘保留",
			"background-mask-iou": "背景蒙版",
			"small-component-retention": "小组件保留",
			"expected-width": "预期宽度",
			"expected-height": "预期高度",
			"deterministic-output": "输出可重复性",
			"catastrophic-failure": "灾难性失败",
			"output-size": "输出尺寸",
		},
	},
} as const;

const renderClientScript = (): string =>
	`window.__QUALITY_REPORT_TRANSLATIONS__=${JSON.stringify(REPORT_TRANSLATIONS)};(${runQualityReportClient.toString()})();`;

const formatMetric = (value: number | undefined): string =>
	value === undefined ? "-" : Number(value.toFixed(3)).toString();

const formatConfidence = (value: number | null): string =>
	value === null ? "-" : value.toFixed(4);

// [Policy] A case description must stand on its own: name the input characteristic,
// the processing being exercised, and what must remain unchanged. Avoid vague text
// such as "preserve the image" when adding an image test.
const describeCase = (
	result: QualityCaseResult,
): { en: string; ja: string } => {
	const options = result.options;
	if (result.id === "convert-deterministic-auto-palette") {
		return {
			en:
				"Keep the image at its original 32 x 32 pixel dimensions and preserve " +
				"fully transparent pixels while reducing its 947 opaque input colors " +
				"to an automatically selected eight-color palette with full-strength Ordered dithering.",
			ja:
				"画像を32×32ピクセルの原寸に保ち、完全透明な画素を維持したまま、" +
				"947色ある不透明な入力色をAutoで選択した8色のパレットへ減色し、" +
				"強度100%のOrderedディザリングを適用します。",
		};
	}
	if (options.reduceColorMode === "gb_pocket") {
		return {
			en: "Convert a continuous-tone image to the four-color Game Boy Pocket palette without dithering.",
			ja: "連続階調画像をディザリングなしでゲームボーイポケットの4色パレットへ変換します。",
		};
	}
	if (options.ditherMode === "floyd-steinberg") {
		return {
			en: "Convert the image to monochrome using full-strength Floyd-Steinberg dithering.",
			ja: "Floyd-Steinbergディザリングを強度100%で適用し、画像をモノクロへ変換します。",
		};
	}
	if (options.makeSquare) {
		return {
			en: "Pad the image to a square canvas without trimming or background removal.",
			ja: "画像をトリミングや背景除去なしで正方形キャンバスへ拡張します。",
		};
	}
	if (result.degradationPatterns.includes("continuous-tone")) {
		return {
			en: "Preserve a continuous-tone image without grid detection or downsampling.",
			ja: "連続階調画像をグリッド検出や縮小処理なしで保持します。",
		};
	}
	if (result.degradationPatterns.includes("pixel-art-1x")) {
		return {
			en: "Preserve native-resolution pixel art, including small disconnected components and its limited palette.",
			ja: "小さな分離パーツや少色パレットを含む等倍のドット絵をそのまま保持します。",
		};
	}
	const target =
		options.forcePixelsW !== undefined && options.forcePixelsH !== undefined
			? `${options.forcePixelsW} x ${options.forcePixelsH}`
			: null;
	if (result.degradationPatterns.length > 0) {
		const patterns = result.degradationPatterns.join(", ");
		return {
			en: `Correct ${patterns}${target ? ` and restore the image to ${target} pixels` : ""}.`,
			ja: `${patterns}の劣化を補正し${target ? `、${target}ピクセルへ復元` : ""}します。`,
		};
	}
	const stepsEn: string[] = [];
	const stepsJa: string[] = [];
	if (options.preRemoveBackground || options.postRemoveBackground) {
		stepsEn.push("remove the background");
		stepsJa.push("背景除去");
	}
	if (options.trimToContent) {
		stepsEn.push("trim transparent margins");
		stepsJa.push("透明余白のトリミング");
	}
	if (options.autoGridFromTrimmed || options.enableGridDetection !== false) {
		stepsEn.push("restore the detected pixel grid");
		stepsJa.push("検出したピクセルグリッドの復元");
	}
	if (stepsEn.length === 0) {
		return target
			? {
					en: `Resize the input image to ${target} pixels without background removal, transparent-margin trimming, or pixel-grid restoration.`,
					ja:
						"背景除去、透明余白のトリミング、ピクセルグリッド復元を行わず、" +
						`入力画像を${target}ピクセルへ変換します。`,
				}
			: {
					en: "Output the input image at its current dimensions without background removal, transparent-margin trimming, or pixel-grid restoration.",
					ja:
						"背景除去、透明余白のトリミング、ピクセルグリッド復元を行わず、" +
						"入力画像を現在の寸法のまま出力します。",
				};
	}
	return {
		en: `${stepsEn.join(", ")}${target ? `, then resize it to ${target} pixels` : ""}.`,
		ja: `${stepsJa.join("、")}${target ? `後、${target}ピクセルへ変換` : ""}します。`,
	};
};

const renderImageDialog = (): string => `
<dialog id="image-dialog">
	<button id="dialog-close">&times;</button>
	<div class="image-stage dialog-stage"><img alt=""></div>
</dialog>`;

const renderReportSidebar = (results: QualityResults): string => {
	const repositoryUrl = escapeHtml(results.metadata.repositoryUrl);
	const commitUrl = (commit: string): string =>
		`${repositoryUrl}/commit/${encodeURIComponent(commit)}`;
	const shortCommit = (commit: string): string =>
		escapeHtml(commit.slice(0, 7));
	const verdictKey =
		results.summary.blockingFailures > 0 ? "hasRegression" : "noRegression";
	return `<aside class="sidebar">
	<h1 data-i18n="title">PixelRefiner quality report</h1>
	<p class="verdict" data-i18n="${verdictKey}">${verdictKey}</p>
	<section class="report-meta" aria-labelledby="report-meta-title">
		<h2 id="report-meta-title" data-i18n="reportDetails">Report details</h2>
		<dl>
			<dt data-i18n="pullRequest">Pull request</dt>
			<dd><a href="${repositoryUrl}/pull/${encodeURIComponent(results.metadata.prNumber)}">#${escapeHtml(results.metadata.prNumber)}</a></dd>
			<dt data-i18n="headCommit">Head</dt>
			<dd><a href="${commitUrl(results.metadata.headCommit)}"
				title="${escapeHtml(results.metadata.headCommit)}"><code>${shortCommit(results.metadata.headCommit)}</code></a></dd>
			<dt data-i18n="baseCommit">PR base</dt>
			<dd><a href="${commitUrl(results.metadata.baseCommit)}"
				title="${escapeHtml(results.metadata.baseCommit)}"><code>${shortCommit(results.metadata.baseCommit)}</code></a></dd>
			<dt data-i18n="baselineCommit">Baseline snapshot</dt>
			<dd><a href="${commitUrl(results.metadata.baselineCommit)}"
				title="${escapeHtml(results.metadata.baselineCommit)}"><code>${shortCommit(results.metadata.baselineCommit)}</code></a></dd>
			<dt data-i18n="generatedAt">Generated</dt>
			<dd><time datetime="${escapeHtml(results.metadata.generatedAt)}">${escapeHtml(results.metadata.generatedAt)}</time></dd>
			<dt data-i18n="workflow">Workflow</dt>
			<dd><a href="${escapeHtml(results.metadata.workflowRunUrl)}" data-i18n="workflow">workflow</a></dd>
		</dl>
	</section>
	<div class="filter-panel">
		<fieldset class="filter-group">
			<legend data-i18n="language">Language</legend>
				<div class="locale-row">
					<button class="locale-button" type="button" data-locale="ja" aria-pressed="false">日本語</button>
					<button class="locale-button" type="button" data-locale="en" aria-pressed="false">English</button>
					<button class="locale-button" type="button" data-locale="zh-CN" aria-pressed="false">简体中文</button>
				</div>
		</fieldset>
		<fieldset class="filter-group">
			<legend data-i18n="changeStatus">Change status</legend>
			<div class="filter-row">
				<button class="filter-button active" type="button" data-change-filter="" aria-pressed="true">
					<span data-i18n="allChanges">All</span>: ${results.summary.caseCount}
				</button>
				<button class="filter-button" type="button" data-change-filter="changed" aria-pressed="false">
					<span data-i18n="changed">changed</span>: ${results.summary.changed}
				</button>
				<button class="filter-button" type="button" data-change-filter="regressed" aria-pressed="false">
					<span data-i18n="regressed">regressed</span>: ${results.summary.regressed}
				</button>
				<button class="filter-button" type="button" data-change-filter="improved" aria-pressed="false">
					<span data-i18n="improved">improved</span>: ${results.summary.improved}
				</button>
				<button class="filter-button" type="button" data-change-filter="unchanged" aria-pressed="false">
					<span data-i18n="unchanged">unchanged</span>: ${results.summary.unchanged}
				</button>
			</div>
		</fieldset>
		<fieldset class="filter-group">
			<legend data-i18n="qualityStatus">Quality status</legend>
			<div class="filter-row">
				<button class="filter-button active" type="button" data-status-filter="" aria-pressed="true"><span data-i18n="allStatuses">All</span></button>
				<button class="filter-button" type="button" data-status-filter="passed" aria-pressed="false">
					<span data-i18n="passed">passed</span>: ${results.summary.passed}
				</button>
				<button class="filter-button" type="button" data-status-filter="failed" aria-pressed="false">
					<span data-i18n="failed">target unmet</span>: ${results.summary.failed}
				</button>
			</div>
		</fieldset>
		<label class="search-row" for="search">
			<span data-i18n="filterCases">Filter cases</span>
			<input id="search" placeholder="Filter cases" data-i18n-placeholder="filterCases">
		</label>
		<p class="filter-summary" aria-live="polite">
			<span data-i18n="displayConditions">Showing</span>:
			<strong id="active-change-label"></strong> &times;
			<strong id="active-status-label"></strong> &mdash;
			<strong id="visible-count">0</strong> / ${results.summary.caseCount}
			<span data-i18n="casesShown">cases</span>
		</p>
	</div>
</aside>`;
};

const renderHtml = (results: QualityResults): string => {
	const changeOrder = {
		regressed: 0,
		new: 1,
		changed: 2,
		improved: 3,
		unchanged: 4,
	};
	const sortedCases = [...results.cases].sort(
		(left, right) =>
			changeOrder[left.changeStatus] - changeOrder[right.changeStatus],
	);
	const cards = sortedCases
		.map((result) => {
			const description = describeCase(result);
			const exactMatch = !result.failedAssertions.includes("exact-image-match");
			const errorTarget = result.expectation.exact
				? "0"
				: `&le;${formatMetric(result.expectation.maxMeanRgbaError)}`;
			const exactMeasurement = result.expectation.exact
				? '<strong data-i18n="exactMatchShort">Exact</strong> ' +
					`<span data-i18n="${exactMatch ? "yes" : "no"}">` +
					`${exactMatch ? "yes" : "no"}</span> &middot; `
				: "";
			const qualityMeasurement = [
				'<small class="case-metrics">',
				exactMeasurement,
				'<strong data-i18n="meanRgbaErrorShort">Error</strong> ',
				`${formatMetric(result.metrics.meanRgbaError)}/${errorTarget}`,
				' &middot; <strong data-i18n="processingTime">Time</strong> ',
				`${result.metrics.runtimeMs.toFixed(2)}ms`,
				' &middot; <strong data-i18n="confidence">Confidence (diagnostic)</strong> ',
				`${formatConfidence(result.confidence)}</small>`,
			].join("");
			const searchable = [
				result.id,
				...result.featureIds,
				result.status,
				result.changeStatus,
				result.inputKind,
				result.route,
				description.en,
				description.ja,
				...result.warnings,
				...result.degradationPatterns,
			].join(" ");
			const renderImages = (
				images: Array<[string, string, string | null]>,
			): string =>
				images
					.filter(
						(image): image is [string, string, string] => image[2] !== null,
					)
					.map(
						([key, label, source]) =>
							`<figure><figcaption data-i18n="${key}">${label}</figcaption>` +
							`<div class="image-stage"><img src="${escapeHtml(source)}" alt="${label}" ` +
							`data-i18n-alt="${key}" loading="lazy"></div></figure>`,
					)
					.join("");
			const primaryImages = renderImages([
				["input", "Input", result.files.input],
				["result", "Result", result.files.result],
			]);
			return `<article class="case ${result.status} ${result.changeStatus}"
			data-status="${result.status}" data-change="${result.changeStatus}" data-search="${escapeHtml(searchable)}">
			<h2>
				${escapeHtml(result.id)}
				<span class="badge ${result.status}" data-i18n="${result.status}">${result.status}</span>
				<span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span>
				${qualityMeasurement}
			</h2>
			<p class="case-description" data-description-en="${escapeHtml(description.en)}"
				data-description-ja="${escapeHtml(description.ja)}">${escapeHtml(description.en)}</p>
			<div class="images primary">${primaryImages}</div><p><a class="detail-link"
				href="${escapeHtml(path.posix.dirname(result.files.result))}/index.html" data-i18n="details">Details</a></p>
		</article>`;
		})
		.join("\n");
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width">
	<title data-i18n="title">PixelRefiner quality report</title>
	<style>
${INDEX_REPORT_STYLES}	</style>
</head>
<body>
	<div class="report-layout">
${renderReportSidebar(results)}
		<main class="report-main">${cards}</main>
	</div>
${renderImageDialog()}
	<script>${renderClientScript()}</script>
</body>
</html>`;
};

const renderCaseDetailHtml = (result: QualityCaseResult): string => {
	const description = describeCase(result);
	const renderImages = (
		images: Array<[string, string, string | null]>,
	): string =>
		images
			.filter((image): image is [string, string, string] => image[2] !== null)
			.map(([key, label, source]) => {
				const fileName = escapeHtml(path.posix.basename(source));
				return (
					`<figure><figcaption data-i18n="${key}">${label}</figcaption>` +
					`<div class="image-stage"><img src="${fileName}" alt="${label}" ` +
					`data-i18n-alt="${key}" loading="lazy"></div></figure>`
				);
			})
			.join("");
	const allImages = renderImages([
		["input", "Input", result.files.input],
		["groundTruth", "Ground truth", result.files.groundTruth],
		["baseline", "Baseline", result.files.baseline],
		["result", "Result", result.files.result],
		["groundTruthDifference", "Ground-truth difference", result.files.diff],
		["baselineDifference", "Baseline difference", result.files.baselineDiff],
		["backgroundMask", "Background mask", result.files.backgroundMask],
	]);
	const warnings =
		result.warnings.length === 0
			? '<span data-i18n="none">none</span>'
			: result.warnings
					.map(
						(warning) =>
							`<span data-i18n="assertions.${escapeHtml(warning)}">${escapeHtml(warning)}</span>`,
					)
					.join(", ");
	const metricState = (key: string): string => {
		if (result.regressedMetrics.includes(key)) return "regressed";
		if (result.improvedMetrics.includes(key)) return "improved";
		return "unchanged";
	};
	const metricRow = (
		key: string,
		current: number,
		baseline: number | undefined,
		target: string,
	): string => {
		const delta = baseline === undefined ? undefined : current - baseline;
		const deltaText =
			delta === undefined
				? "-"
				: `${delta > 0 ? "+" : ""}${formatMetric(delta)}`;
		const state = metricState(key);
		return `<tr class="${state}">
			<th data-i18n="${key}">${key}</th>
			<td>${escapeHtml(target)}</td>
			<td>${formatMetric(baseline)}</td>
			<td>${formatMetric(current)}</td>
			<td>${deltaText}</td>
			<td data-i18n="${state}">${state}</td>
		</tr>`;
	};
	const baselineMetrics = result.baselineMetrics;
	const expectedSize =
		result.expectation.expectedWidth !== undefined &&
		result.expectation.expectedHeight !== undefined
			? `${result.expectation.expectedWidth}x${result.expectation.expectedHeight}`
			: "correct";
	const sizeState = result.metrics.sizeCorrect ? "passed" : "failed";
	const sizeRow = `<tr class="${sizeState}">
		<th data-i18n="outputSize">Output size</th>
		<td>${expectedSize}</td>
		<td>${baselineMetrics ? `${baselineMetrics.outputWidth}x${baselineMetrics.outputHeight}` : "-"}</td>
		<td>${result.metrics.outputWidth}x${result.metrics.outputHeight}</td>
		<td>-</td>
		<td data-i18n="${sizeState}">${sizeState}</td>
	</tr>`;
	const metricRows = [
		sizeRow,
		metricRow(
			"meanRgbaError",
			result.metrics.meanRgbaError,
			baselineMetrics?.meanRgbaError,
			result.expectation.maxMeanRgbaError === undefined
				? "-"
				: `<= ${result.expectation.maxMeanRgbaError}`,
		),
		metricRow(
			"edgeF1",
			result.metrics.edgeF1,
			baselineMetrics?.edgeF1,
			result.expectation.minEdgeF1 === undefined
				? "-"
				: `>= ${result.expectation.minEdgeF1}`,
		),
		metricRow(
			"backgroundMaskIou",
			result.metrics.backgroundMaskIou,
			baselineMetrics?.backgroundMaskIou,
			result.expectation.minBackgroundMaskIou === undefined
				? "-"
				: `>= ${result.expectation.minBackgroundMaskIou}`,
		),
		metricRow(
			"smallComponentRetention",
			result.metrics.smallComponentRetention,
			baselineMetrics?.smallComponentRetention,
			result.expectation.minSmallComponentRetention === undefined
				? "-"
				: `>= ${result.expectation.minSmallComponentRetention}`,
		),
	].join("\n");
	const changedPixels =
		result.changedPixelCount === null
			? "-"
			: `${result.changedPixelCount} (${((result.changedPixelRate ?? 0) * 100).toFixed(2)}%)`;
	const tags = result.degradationPatterns
		.map((pattern) => `<span class="tag">${escapeHtml(pattern)}</span>`)
		.join(" ");
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width">
	<title>${escapeHtml(result.id)} - PixelRefiner quality report</title>
	<style>
${DETAIL_REPORT_STYLES}	</style>
</head>
<body>
	<a class="back-link" href="../../index.html" data-i18n="backToReport">Back to report</a>
	<main>
		<h1>
			${escapeHtml(result.id)}
			<span class="badge ${result.status}" data-i18n="${result.status}">${result.status}</span>
			<span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span>
		</h1>
		<p class="case-description" data-description-en="${escapeHtml(description.en)}"
			data-description-ja="${escapeHtml(description.ja)}">${escapeHtml(description.en)}</p>
		<p>${tags}</p>
		<p><strong data-i18n="changedPixels">Changed pixels</strong>: ${changedPixels}</p>
		<section>
			<h2 data-i18n="diagnostics">All images and settings</h2>
			<div class="images">${allImages}</div>
		</section>
		<section>
			<h2 data-i18n="comparison">Metric comparison</h2>
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th data-i18n="metric">Metric</th>
							<th data-i18n="target">Target</th>
							<th data-i18n="baseline">Baseline</th>
							<th data-i18n="current">Current</th>
							<th data-i18n="delta">Delta</th>
							<th data-i18n="verdict">Verdict</th>
						</tr>
					</thead>
					<tbody>${metricRows}</tbody>
				</table>
			</div>
		</section>
		<section>
			<h2 data-i18n="options">Options</h2>
			<dl>
				<dt data-i18n="inputKind">Input kind</dt><dd>${escapeHtml(result.inputKind)}</dd>
				<dt data-i18n="route">Route</dt><dd data-i18n="${result.route}">${result.route}</dd>
				<dt data-i18n="confidence">Confidence (diagnostic)</dt><dd>${formatConfidence(result.confidence)}</dd>
				<dt data-i18n="warnings">Warnings</dt><dd>${warnings}</dd>
				<dt data-i18n="topCandidates">Top candidates</dt><dd><code>${escapeHtml(JSON.stringify(result.gridCandidates))}</code></dd>
				<dt data-i18n="metrics">Metrics</dt><dd><code>${escapeHtml(JSON.stringify(result.metrics))}</code></dd>
				<dt data-i18n="options">Options</dt><dd><code>${escapeHtml(JSON.stringify(result.options))}</code></dd>
			</dl>
		</section>
	</main>
${renderImageDialog()}
	<script>${renderClientScript()}</script>
</body>
</html>`;
};

const renderMarkdown = (results: QualityResults): string => {
	const summary = results.summary;
	const rows = results.cases
		.map((result) =>
			[
				`|${result.id}`,
				`|${result.status}`,
				`|${result.metrics.outputWidth}x${result.metrics.outputHeight}`,
				`|${formatConfidence(result.confidence)}`,
				`|${result.metrics.meanRgbaError.toFixed(3)}`,
				`|${result.metrics.edgeF1.toFixed(3)}`,
				`|${result.metrics.runtimeMs.toFixed(2)}|`,
			].join(""),
		)
		.join("\n");
	return `# PixelRefiner quality report

- Cases: ${summary.caseCount}
- Passed: ${summary.passed}
- Failed: ${summary.failed}
- Changed: ${summary.changed}
- Regressed: ${summary.regressed}
- Improved: ${summary.improved}
- Top-1 size accuracy: ${(summary.top1SizeAccuracy * 100).toFixed(1)}%
- Top-3 size accuracy: ${(summary.top3SizeAccuracy * 100).toFixed(1)}%
- Confidence/correctness correlation: ${
		summary.confidenceCorrectnessCorrelation === null
			? "n/a"
			: summary.confidenceCorrectnessCorrelation.toFixed(3)
	}
- Catastrophic failure rate: ${(summary.catastrophicFailureRate * 100).toFixed(
		1,
	)}%

|Case|Status|Output|Confidence (diagnostic)|Mean RGBA error|Edge F1|Runtime (ms)|
|---|---|---:|---:|---:|---:|---:|
${rows}
`;
};

export const generateQualityReport = (
	cases: QualityImageCase[],
): QualityResults => {
	rmSync(REPORT_ROOT, { recursive: true, force: true });
	mkdirSync(REPORT_ROOT, { recursive: true });
	const caseResults = cases.map((qualityCase) =>
		runQualityCase(qualityCase, true),
	);
	const results: QualityResults = {
		metadata: metadataFromEnvironment(),
		summary: summarize(caseResults),
		cases: caseResults,
	};
	writeFileSync(
		path.join(REPORT_ROOT, "results.json"),
		`${JSON.stringify(results, null, 2)}\n`,
	);
	writeFileSync(path.join(REPORT_ROOT, "summary.md"), renderMarkdown(results));
	writeFileSync(path.join(REPORT_ROOT, "index.html"), renderHtml(results));
	for (const result of results.cases) {
		writeFileSync(
			path.join(REPORT_ROOT, "cases", result.id, "index.html"),
			renderCaseDetailHtml(result),
		);
	}
	return results;
};

export const reportRoot = REPORT_ROOT;
