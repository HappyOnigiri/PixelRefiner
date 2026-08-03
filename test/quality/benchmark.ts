import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { processImage } from "../../src/core/processor";
import { LEGACY_PROCESS_OPTIONS_V1 } from "../../src/shared/config";
import { baselineImagePath, loadBaseline } from "./baseline";
import { classifyChange, compareImages, compareMetrics } from "./comparison";
import { imagesEqual, readPng, writePng } from "./image";
import { qualityCaseDirectory } from "./manifest";
import {
	calculateMetrics,
	createBackgroundMaskImage,
	createDiffImage,
} from "./metrics";
import {
	runRolloutCase,
	selectRolloutCases,
	summarizeRollout,
} from "./rollout";
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
	const options = {
		...LEGACY_PROCESS_OPTIONS_V1,
		...qualityCase.options,
		debug: false,
	};

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
	const options = {
		...LEGACY_PROCESS_OPTIONS_V1,
		...qualityCase.options,
		debug: false,
	};
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
		changed: cases.filter((result) => result.changeStatus === "changed").length,
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

import {
	renderCaseDetailHtml,
	renderHtml,
	renderMarkdown,
} from "./report/render";

export const generateQualityReport = (
	cases: QualityImageCase[],
): QualityResults => {
	rmSync(REPORT_ROOT, { recursive: true, force: true });
	mkdirSync(REPORT_ROOT, { recursive: true });
	const caseResults = cases.map((qualityCase) =>
		runQualityCase(qualityCase, true),
	);
	const rollout = summarizeRollout(
		selectRolloutCases(cases).map((qualityCase) =>
			runRolloutCase(qualityCase, REPORT_ROOT),
		),
	);
	const results: QualityResults = {
		metadata: metadataFromEnvironment(),
		summary: summarize(caseResults),
		rollout,
		cases: caseResults,
	};
	writeFileSync(
		path.join(REPORT_ROOT, "results.json"),
		`${JSON.stringify(results, null, 2)}\n`,
	);
	writeFileSync(path.join(REPORT_ROOT, "summary.md"), renderMarkdown(results));
	writeFileSync(path.join(REPORT_ROOT, "index.html"), renderHtml(results));
	const rolloutById = new Map(
		results.rollout.cases.map((result) => [result.id, result]),
	);
	for (const result of results.cases) {
		writeFileSync(
			path.join(REPORT_ROOT, "cases", result.id, "index.html"),
			renderCaseDetailHtml(result, rolloutById.get(result.id)),
		);
	}
	return results;
};

export const reportRoot = REPORT_ROOT;
