import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { processImage } from "../../src/core/processor";
import { baselineImagePath, loadBaseline } from "./baseline";
import { classifyChange, compareImages, compareMetrics } from "./comparison";
import { imagesEqual, readPng, writePng } from "./image";
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
	const baseline = loadBaseline();
	const baselineMetrics =
		baseline.cases.find((baselineCase) => baselineCase.id === qualityCase.id) ??
		null;
	const storedBaselinePath = baselineImagePath(qualityCase.id);
	const baselineImage = existsSync(storedBaselinePath)
		? readPng(storedBaselinePath)
		: null;
	const imageComparison = compareImages(currentRun.result, baselineImage);
	const metricComparison = compareMetrics(metrics, baselineMetrics);
	const changeStatus = classifyChange(
		baselineImage !== null,
		imageComparison.changed,
		metricComparison.regressed,
		metricComparison.improved,
	);
	const caseDirectory = `cases/${qualityCase.id}`;
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
		status: failed.length === 0 ? "passed" : "failed",
		changeStatus,
		failedAssertions: failed,
		regressedMetrics: metricComparison.regressed,
		improvedMetrics: metricComparison.improved,
		changedPixelCount: imageComparison.changedPixelCount,
		changedPixelRate: imageComparison.changedPixelRate,
		diffBoundingBox: imageComparison.diffBoundingBox,
		classification: qualityCase.inputKind,
		route:
			qualityCase.options.enableGridDetection === false ? "preserve" : "refine",
		confidence: null,
		warnings: failed,
		gridCandidates: [currentRun.grid, ...(currentRun.grid.candidates ?? [])]
			.slice(0, 3)
			.map((candidate) => ({
				width: candidate.outW ?? null,
				height: candidate.outH ?? null,
				score: candidate.score,
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
	const sum = (select: (result: QualityCaseResult) => number): number => {
		let total = 0;
		for (const result of cases) total += select(result);
		return count === 0 ? 0 : total / count;
	};
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
		top1SizeAccuracy: sum((result) => Number(result.metrics.sizeCorrect)),
		top3SizeAccuracy: sum((result) => Number(result.metrics.top3SizeCorrect)),
		byteIdentityRate: sum((result) => Number(result.metrics.byteIdentical)),
		catastrophicFailureRate: sum((result) =>
			Number(result.metrics.catastrophicFailure),
		),
		meanRgbaError: sum((result) => result.metrics.meanRgbaError),
		meanRuntimeMs: sum((result) => result.metrics.runtimeMs),
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
		confidence: "Confidence",
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
		title: "\u54c1\u8cea\u30ec\u30dd\u30fc\u30c8",
		groundTruth: "\u671f\u5f85\u7d50\u679c",
		input: "\u5165\u529b",
		baseline: "\u57fa\u6e96\u7d50\u679c",
		result: "\u51e6\u7406\u7d50\u679c",
		groundTruthDifference: "\u671f\u5f85\u7d50\u679c\u3068\u306e\u5dee\u5206",
		baselineDifference: "\u57fa\u6e96\u7d50\u679c\u3068\u306e\u5dee\u5206",
		backgroundMask: "\u80cc\u666f\u30de\u30b9\u30af",
		inputKind: "\u5165\u529b\u7a2e\u5225",
		route: "\u51e6\u7406\u30eb\u30fc\u30c8",
		confidence: "\u4fe1\u983c\u5ea6",
		notAvailable: "\u53d6\u5f97\u4e0d\u53ef",
		warnings: "\u8b66\u544a",
		none: "\u306a\u3057",
		topCandidates: "\u4e0a\u4f4d\u5019\u88dc",
		metrics: "\u8a55\u4fa1\u6307\u6a19",
		options: "\u51e6\u7406\u8a2d\u5b9a",
		filterCases: "\u30b1\u30fc\u30b9\u3092\u7d5e\u308a\u8fbc\u3080",
		language: "\u8868\u793a\u8a00\u8a9e",
		allStatuses: "\u3059\u3079\u3066",
		passed: "\u5408\u683c",
		failed: "\u76ee\u6a19\u672a\u9054",
		preserve: "\u4fdd\u6301",
		refine: "\u5fa9\u5143",
		workflow: "\u5b9f\u884c\u30ed\u30b0",
		changed: "base branch\u304b\u3089\u5909\u66f4",
		improved: "base branch\u3088\u308a\u6539\u5584",
		regressed: "base branch\u3088\u308a\u60aa\u5316",
		unchanged: "base branch\u3068\u5dee\u5206\u306a\u3057",
		new: "base branch\u306b\u306a\u3044\u65b0\u898f\u30b1\u30fc\u30b9",
		changedCases: "\u5dee\u5206\u3042\u308a",
		allChanges: "\u3059\u3079\u3066",
		qualityStatus: "\u54c1\u8cea\u72b6\u614b",
		changeStatus: "\u5909\u5316\u72b6\u614b",
		reportDetails: "\u30ec\u30dd\u30fc\u30c8\u60c5\u5831",
		pullRequest: "\u30d7\u30eb\u30ea\u30af\u30a8\u30b9\u30c8",
		headCommit: "HEAD",
		baseCommit: "PR\u306e\u30d9\u30fc\u30b9",
		baselineCommit: "\u6bd4\u8f03\u57fa\u6e96",
		generatedAt: "\u751f\u6210\u65e5\u6642",
		displayConditions: "\u8868\u793a\u6761\u4ef6",
		casesShown: "\u4ef6",
		changedPixels: "\u5909\u66f4\u753b\u7d20",
		comparison: "\u6307\u6a19\u306e\u6bd4\u8f03",
		metric: "\u6307\u6a19",
		target: "\u5408\u683c\u6761\u4ef6",
		current: "\u4eca\u56de",
		delta: "\u5909\u5316\u91cf",
		verdict: "\u5224\u5b9a",
		outputSize: "\u51fa\u529b\u30b5\u30a4\u30ba",
		meanRgbaError: "RGBA\u5e73\u5747\u8aa4\u5dee",
		meanRgbaErrorShort: "\u8aa4\u5dee",
		processingTime: "\u6642\u9593",
		exactMatch: "\u5b8c\u5168\u4e00\u81f4",
		exactMatchShort: "\u4e00\u81f4",
		yes: "\u306f\u3044",
		no: "\u3044\u3044\u3048",
		edgeF1: "\u8f2a\u90edF1",
		backgroundMaskIou: "\u80cc\u666f\u30de\u30b9\u30afIoU",
		smallComponentRetention: "\u5c0f\u8981\u7d20\u4fdd\u6301\u7387",
		diagnostics:
			"\u3059\u3079\u3066\u306e\u753b\u50cf\u3068\u51e6\u7406\u8a2d\u5b9a",
		details: "\u8a73\u7d30",
		backToReport: "\u30ec\u30dd\u30fc\u30c8\u306b\u623b\u308b",
		noRegression:
			"\u65b0\u305f\u306a\u54c1\u8cea\u60aa\u5316\u306f\u3042\u308a\u307e\u305b\u3093",
		hasRegression:
			"\u54c1\u8cea\u306e\u60aa\u5316\u3092\u691c\u51fa\u3057\u307e\u3057\u305f",
		assertions: {
			"exact-image-match": "\u753b\u50cf\u306e\u5b8c\u5168\u4e00\u81f4",
			"mean-rgba-error": "RGBA\u5e73\u5747\u8aa4\u5dee",
			"edge-f1": "\u8f2a\u90ed\u306e\u4fdd\u6301",
			"background-mask-iou": "\u80cc\u666f\u30de\u30b9\u30af",
			"small-component-retention": "\u5c0f\u8981\u7d20\u306e\u4fdd\u6301",
			"expected-width": "\u671f\u5f85\u3059\u308b\u5e45",
			"expected-height": "\u671f\u5f85\u3059\u308b\u9ad8\u3055",
			"deterministic-output": "\u51fa\u529b\u306e\u518d\u73fe\u6027",
			"catastrophic-failure": "\u81f4\u547d\u7684\u306a\u5931\u6557",
			"output-size": "\u51fa\u529b\u30b5\u30a4\u30ba",
		},
	},
} as const;

const renderClientScript = (): string =>
	`window.__QUALITY_REPORT_TRANSLATIONS__=${JSON.stringify(REPORT_TRANSLATIONS)};(${runQualityReportClient.toString()})();`;

const formatMetric = (value: number | undefined): string =>
	value === undefined ? "-" : Number(value.toFixed(3)).toString();

const describeCase = (
	result: QualityCaseResult,
): { en: string; ja: string } => {
	const options = result.options;
	if (options.reduceColorMode === "gb_pocket") {
		return {
			en: "Convert a continuous-tone image to the four-color Game Boy Pocket palette without dithering.",
			ja: "\u9023\u7d9a\u968e\u8abf\u753b\u50cf\u3092\u30c7\u30a3\u30b6\u30ea\u30f3\u30b0\u306a\u3057\u3067\u30b2\u30fc\u30e0\u30dc\u30fc\u30a4\u30dd\u30b1\u30c3\u30c8\u306e4\u8272\u30d1\u30ec\u30c3\u30c8\u3078\u5909\u63db\u3057\u307e\u3059\u3002",
		};
	}
	if (options.ditherMode === "floyd-steinberg") {
		return {
			en: "Convert the image to monochrome using full-strength Floyd-Steinberg dithering.",
			ja: "Floyd-Steinberg\u30c7\u30a3\u30b6\u30ea\u30f3\u30b0\u3092\u5f37\u5ea6100%\u3067\u9069\u7528\u3057\u3001\u753b\u50cf\u3092\u30e2\u30ce\u30af\u30ed\u3078\u5909\u63db\u3057\u307e\u3059\u3002",
		};
	}
	if (options.makeSquare) {
		return {
			en: "Pad the image to a square canvas without trimming or background removal.",
			ja: "\u753b\u50cf\u3092\u30c8\u30ea\u30df\u30f3\u30b0\u3084\u80cc\u666f\u9664\u53bb\u306a\u3057\u3067\u6b63\u65b9\u5f62\u30ad\u30e3\u30f3\u30d0\u30b9\u3078\u62e1\u5f35\u3057\u307e\u3059\u3002",
		};
	}
	if (result.degradationPatterns.includes("continuous-tone")) {
		return {
			en: "Preserve a continuous-tone image without grid detection or downsampling.",
			ja: "\u9023\u7d9a\u968e\u8abf\u753b\u50cf\u3092\u30b0\u30ea\u30c3\u30c9\u691c\u51fa\u3084\u7e2e\u5c0f\u51e6\u7406\u306a\u3057\u3067\u4fdd\u6301\u3057\u307e\u3059\u3002",
		};
	}
	if (result.degradationPatterns.includes("pixel-art-1x")) {
		return {
			en: "Preserve native-resolution pixel art, including small disconnected components and its limited palette.",
			ja: "\u5c0f\u3055\u306a\u5206\u96e2\u30d1\u30fc\u30c4\u3084\u5c11\u8272\u30d1\u30ec\u30c3\u30c8\u3092\u542b\u3080\u7b49\u500d\u306e\u30c9\u30c3\u30c8\u7d75\u3092\u305d\u306e\u307e\u307e\u4fdd\u6301\u3057\u307e\u3059\u3002",
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
			ja: `${patterns}\u306e\u52a3\u5316\u3092\u88dc\u6b63\u3057${target ? `\u3001${target}\u30d4\u30af\u30bb\u30eb\u3078\u5fa9\u5143` : ""}\u3057\u307e\u3059\u3002`,
		};
	}
	const stepsEn: string[] = [];
	const stepsJa: string[] = [];
	if (options.preRemoveBackground || options.postRemoveBackground) {
		stepsEn.push("remove the background");
		stepsJa.push("\u80cc\u666f\u9664\u53bb");
	}
	if (options.trimToContent) {
		stepsEn.push("trim transparent margins");
		stepsJa.push(
			"\u900f\u660e\u4f59\u767d\u306e\u30c8\u30ea\u30df\u30f3\u30b0",
		);
	}
	if (options.autoGridFromTrimmed || options.enableGridDetection !== false) {
		stepsEn.push("restore the detected pixel grid");
		stepsJa.push(
			"\u691c\u51fa\u3057\u305f\u30d4\u30af\u30bb\u30eb\u30b0\u30ea\u30c3\u30c9\u306e\u5fa9\u5143",
		);
	}
	return {
		en: `${stepsEn.length > 0 ? stepsEn.join(", ") : "Preserve the image"}${target ? `, then resize it to ${target} pixels` : ""}.`,
		ja: `${stepsJa.length > 0 ? stepsJa.join("\u3001") : "\u753b\u50cf\u3092\u4fdd\u6301"}${target ? `\u5f8c\u3001${target}\u30d4\u30af\u30bb\u30eb\u3078\u5909\u63db` : ""}\u3057\u307e\u3059\u3002`,
	};
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
				? `<strong data-i18n="exactMatchShort">Exact</strong> <span data-i18n="${exactMatch ? "yes" : "no"}">${exactMatch ? "yes" : "no"}</span> &middot; `
				: "";
			const qualityMeasurement = `<small class="case-metrics">${exactMeasurement}<strong data-i18n="meanRgbaErrorShort">Error</strong> ${formatMetric(result.metrics.meanRgbaError)}/${errorTarget} &middot; <strong data-i18n="processingTime">Time</strong> ${result.metrics.runtimeMs.toFixed(2)}ms</small>`;
			const searchable = [
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
							`<figure><figcaption data-i18n="${key}">${label}</figcaption><div class="image-stage"><img src="${source}" alt="${label}" data-i18n-alt="${key}" loading="lazy"></div></figure>`,
					)
					.join("");
			const primaryImages = renderImages([
				["input", "Input", result.files.input],
				["result", "Result", result.files.result],
			]);
			return `<article class="case ${result.status} ${result.changeStatus}" data-status="${result.status}" data-change="${result.changeStatus}" data-search="${escapeHtml(searchable)}">
			<h2>${escapeHtml(result.id)} <span class="badge ${result.status}" data-i18n="${result.status}">${result.status}</span> <span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span> ${qualityMeasurement}</h2>
			<p class="case-description" data-description-en="${escapeHtml(description.en)}" data-description-ja="${escapeHtml(description.ja)}">${escapeHtml(description.en)}</p>
			<div class="images primary">${primaryImages}</div><p><a class="detail-link" href="cases/${encodeURIComponent(result.id)}/index.html" data-i18n="details">Details</a></p>
		</article>`;
		})
		.join("\n");
	const repositoryUrl = escapeHtml(results.metadata.repositoryUrl);
	const prUrl = `${repositoryUrl}/pull/${encodeURIComponent(results.metadata.prNumber)}`;
	const headCommitUrl = `${repositoryUrl}/commit/${encodeURIComponent(results.metadata.headCommit)}`;
	const baseCommitUrl = `${repositoryUrl}/commit/${encodeURIComponent(results.metadata.baseCommit)}`;
	const baselineCommitUrl = `${repositoryUrl}/commit/${encodeURIComponent(results.metadata.baselineCommit)}`;
	const shortCommit = (commit: string): string =>
		escapeHtml(commit.slice(0, 7));
	const verdictKey =
		results.summary.blockingFailures > 0 ? "hasRegression" : "noRegression";
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title data-i18n="title">PixelRefiner quality report</title><style>
${INDEX_REPORT_STYLES}</style></head><body>
	<div class="report-layout"><aside class="sidebar"><h1 data-i18n="title">PixelRefiner quality report</h1><p class="verdict" data-i18n="${verdictKey}">${verdictKey}</p><section class="report-meta" aria-labelledby="report-meta-title"><h2 id="report-meta-title" data-i18n="reportDetails">Report details</h2><dl><dt data-i18n="pullRequest">Pull request</dt><dd><a href="${prUrl}">#${escapeHtml(results.metadata.prNumber)}</a></dd><dt data-i18n="headCommit">Head</dt><dd><a href="${headCommitUrl}" title="${escapeHtml(results.metadata.headCommit)}"><code>${shortCommit(results.metadata.headCommit)}</code></a></dd><dt data-i18n="baseCommit">PR base</dt><dd><a href="${baseCommitUrl}" title="${escapeHtml(results.metadata.baseCommit)}"><code>${shortCommit(results.metadata.baseCommit)}</code></a></dd><dt data-i18n="baselineCommit">Baseline snapshot</dt><dd><a href="${baselineCommitUrl}" title="${escapeHtml(results.metadata.baselineCommit)}"><code>${shortCommit(results.metadata.baselineCommit)}</code></a></dd><dt data-i18n="generatedAt">Generated</dt><dd><time datetime="${escapeHtml(results.metadata.generatedAt)}">${escapeHtml(results.metadata.generatedAt)}</time></dd><dt data-i18n="workflow">Workflow</dt><dd><a href="${escapeHtml(results.metadata.workflowRunUrl)}" data-i18n="workflow">workflow</a></dd></dl></section><div class="filter-panel"><fieldset class="filter-group"><legend data-i18n="language">Language</legend><div class="locale-row"><button class="locale-button" type="button" data-locale="ja" aria-pressed="false">&#26085;&#26412;&#35486;</button><button class="locale-button" type="button" data-locale="en" aria-pressed="false">English</button></div></fieldset><fieldset class="filter-group"><legend data-i18n="changeStatus">Change status</legend><div class="filter-row"><button class="filter-button active" type="button" data-change-filter="" aria-pressed="true"><span data-i18n="allChanges">All</span>: ${results.summary.caseCount}</button><button class="filter-button" type="button" data-change-filter="changed" aria-pressed="false"><span data-i18n="changed">changed</span>: ${results.summary.changed}</button><button class="filter-button" type="button" data-change-filter="regressed" aria-pressed="false"><span data-i18n="regressed">regressed</span>: ${results.summary.regressed}</button><button class="filter-button" type="button" data-change-filter="improved" aria-pressed="false"><span data-i18n="improved">improved</span>: ${results.summary.improved}</button><button class="filter-button" type="button" data-change-filter="unchanged" aria-pressed="false"><span data-i18n="unchanged">unchanged</span>: ${results.summary.unchanged}</button></div></fieldset><fieldset class="filter-group"><legend data-i18n="qualityStatus">Quality status</legend><div class="filter-row"><button class="filter-button active" type="button" data-status-filter="" aria-pressed="true"><span data-i18n="allStatuses">All</span></button><button class="filter-button" type="button" data-status-filter="passed" aria-pressed="false"><span data-i18n="passed">passed</span>: ${results.summary.passed}</button><button class="filter-button" type="button" data-status-filter="failed" aria-pressed="false"><span data-i18n="failed">target unmet</span>: ${results.summary.failed}</button></div></fieldset><label class="search-row" for="search"><span data-i18n="filterCases">Filter cases</span><input id="search" placeholder="Filter cases" data-i18n-placeholder="filterCases"></label><p class="filter-summary" aria-live="polite"><span data-i18n="displayConditions">Showing</span>: <strong id="active-change-label"></strong> &times; <strong id="active-status-label"></strong> &mdash; <strong id="visible-count">0</strong> / ${results.summary.caseCount} <span data-i18n="casesShown">cases</span></p></div></aside>
	<main class="report-main">${cards}</main></div><dialog id="image-dialog"><button id="dialog-close">&times;</button><div class="image-stage dialog-stage"><img alt=""></div></dialog><script>${renderClientScript()}</script></body></html>`;
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
				return `<figure><figcaption data-i18n="${key}">${label}</figcaption><div class="image-stage"><img src="${fileName}" alt="${label}" data-i18n-alt="${key}" loading="lazy"></div></figure>`;
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
		return `<tr class="${state}"><th data-i18n="${key}">${key}</th><td>${escapeHtml(target)}</td><td>${formatMetric(baseline)}</td><td>${formatMetric(current)}</td><td>${deltaText}</td><td data-i18n="${state}">${state}</td></tr>`;
	};
	const baselineMetrics = result.baselineMetrics;
	const expectedSize =
		result.expectation.expectedWidth !== undefined &&
		result.expectation.expectedHeight !== undefined
			? `${result.expectation.expectedWidth}x${result.expectation.expectedHeight}`
			: "correct";
	const sizeState = result.metrics.sizeCorrect ? "passed" : "failed";
	const metricRows = `<tr class="${sizeState}"><th data-i18n="outputSize">Output size</th><td>${expectedSize}</td><td>${baselineMetrics ? `${baselineMetrics.outputWidth}x${baselineMetrics.outputHeight}` : "-"}</td><td>${result.metrics.outputWidth}x${result.metrics.outputHeight}</td><td>-</td><td data-i18n="${sizeState}">${sizeState}</td></tr>
	${metricRow("meanRgbaError", result.metrics.meanRgbaError, baselineMetrics?.meanRgbaError, result.expectation.maxMeanRgbaError === undefined ? "-" : `<= ${result.expectation.maxMeanRgbaError}`)}
	${metricRow("edgeF1", result.metrics.edgeF1, baselineMetrics?.edgeF1, result.expectation.minEdgeF1 === undefined ? "-" : `>= ${result.expectation.minEdgeF1}`)}
	${metricRow("backgroundMaskIou", result.metrics.backgroundMaskIou, baselineMetrics?.backgroundMaskIou, result.expectation.minBackgroundMaskIou === undefined ? "-" : `>= ${result.expectation.minBackgroundMaskIou}`)}
	${metricRow("smallComponentRetention", result.metrics.smallComponentRetention, baselineMetrics?.smallComponentRetention, result.expectation.minSmallComponentRetention === undefined ? "-" : `>= ${result.expectation.minSmallComponentRetention}`)}`;
	const changedPixels =
		result.changedPixelCount === null
			? "-"
			: `${result.changedPixelCount} (${((result.changedPixelRate ?? 0) * 100).toFixed(2)}%)`;
	const tags = result.degradationPatterns
		.map((pattern) => `<span class="tag">${escapeHtml(pattern)}</span>`)
		.join(" ");
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(result.id)} - PixelRefiner quality report</title><style>
${DETAIL_REPORT_STYLES}</style></head><body>
	<a class="back-link" href="../../index.html" data-i18n="backToReport">Back to report</a><main><h1>${escapeHtml(result.id)} <span class="badge ${result.status}" data-i18n="${result.status}">${result.status}</span> <span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span></h1><p class="case-description" data-description-en="${escapeHtml(description.en)}" data-description-ja="${escapeHtml(description.ja)}">${escapeHtml(description.en)}</p><p>${tags}</p><p><strong data-i18n="changedPixels">Changed pixels</strong>: ${changedPixels}</p><section><h2 data-i18n="diagnostics">All images and settings</h2><div class="images">${allImages}</div></section><section><h2 data-i18n="comparison">Metric comparison</h2><div class="table-scroll"><table><thead><tr><th data-i18n="metric">Metric</th><th data-i18n="target">Target</th><th data-i18n="baseline">Baseline</th><th data-i18n="current">Current</th><th data-i18n="delta">Delta</th><th data-i18n="verdict">Verdict</th></tr></thead><tbody>${metricRows}</tbody></table></div></section><section><h2 data-i18n="options">Options</h2><dl><dt data-i18n="inputKind">Input kind</dt><dd>${escapeHtml(result.inputKind)}</dd><dt data-i18n="route">Route</dt><dd data-i18n="${result.route}">${result.route}</dd><dt data-i18n="warnings">Warnings</dt><dd>${warnings}</dd><dt data-i18n="topCandidates">Top candidates</dt><dd><code>${escapeHtml(JSON.stringify(result.gridCandidates))}</code></dd><dt data-i18n="metrics">Metrics</dt><dd><code>${escapeHtml(JSON.stringify(result.metrics))}</code></dd><dt data-i18n="options">Options</dt><dd><code>${escapeHtml(JSON.stringify(result.options))}</code></dd></dl></section></main><dialog id="image-dialog"><button id="dialog-close">&times;</button><div class="image-stage dialog-stage"><img alt=""></div></dialog><script>${renderClientScript()}</script></body></html>`;
};

const renderMarkdown = (results: QualityResults): string => {
	const summary = results.summary;
	const rows = results.cases
		.map(
			(result) =>
				`|${result.id}|${result.status}|${result.metrics.outputWidth}x${result.metrics.outputHeight}|${result.metrics.meanRgbaError.toFixed(3)}|${result.metrics.edgeF1.toFixed(3)}|${result.metrics.runtimeMs.toFixed(2)}|`,
		)
		.join("\n");
	return `# PixelRefiner quality report\n\n- Cases: ${summary.caseCount}\n- Passed: ${summary.passed}\n- Failed: ${summary.failed}\n- Changed: ${summary.changed}\n- Regressed: ${summary.regressed}\n- Improved: ${summary.improved}\n- Top-1 size accuracy: ${(summary.top1SizeAccuracy * 100).toFixed(1)}%\n- Top-3 size accuracy: ${(summary.top3SizeAccuracy * 100).toFixed(1)}%\n- Catastrophic failure rate: ${(summary.catastrophicFailureRate * 100).toFixed(1)}%\n\n|Case|Status|Output|Mean RGBA error|Edge F1|Runtime (ms)|\n|---|---|---:|---:|---:|---:|\n${rows}\n`;
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
