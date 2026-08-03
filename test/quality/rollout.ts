import { mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { processImage } from "../../src/core/processor";
import {
	LEGACY_PROCESS_OPTIONS_V1,
	PROCESS_DEFAULTS,
} from "../../src/shared/config";
import { compareMetrics } from "./comparison";
import { imagesEqual, readPng, writePng } from "./image";
import { qualityCaseDirectory } from "./manifest";
import { calculateMetrics, createDiffImage } from "./metrics";
import type {
	QualityBaselineCase,
	QualityImageCase,
	QualityRolloutCaseResult,
	QualityRolloutResults,
} from "./types";

export const selectRolloutCases = (
	cases: QualityImageCase[],
): QualityImageCase[] =>
	cases.filter(
		(qualityCase) =>
			qualityCase.options.processingMode === "auto" ||
			qualityCase.featureIds.includes("PRF-900"),
	);

const baselineFromMetrics = (
	metrics: QualityRolloutCaseResult["legacy"]["metrics"],
): QualityBaselineCase => ({
	id: "legacy",
	status: "passed",
	outputWidth: metrics.outputWidth,
	outputHeight: metrics.outputHeight,
	meanRgbaError: metrics.meanRgbaError,
	edgeF1: metrics.edgeF1,
	backgroundMaskIou: metrics.backgroundMaskIou,
	smallComponentRetention: metrics.smallComponentRetention,
	catastrophicFailure: metrics.catastrophicFailure,
});

export const runRolloutCase = (
	qualityCase: QualityImageCase,
	reportRoot?: string,
): QualityRolloutCaseResult => {
	const input = readPng(path.resolve(qualityCase.input));
	const expected = readPng(path.resolve(qualityCase.expected));
	const { processingMode: _processingMode, ...sharedOptions } =
		qualityCase.options;
	const nextOptions = {
		...sharedOptions,
		processingMode: PROCESS_DEFAULTS.processingMode,
		debug: false,
	} as const;
	const legacyOptions = {
		...LEGACY_PROCESS_OPTIONS_V1,
		...sharedOptions,
		debug: false,
	} as const;

	const nextStart = performance.now();
	const next = processImage(input, nextOptions);
	const nextRuntime = performance.now() - nextStart;
	const nextRepeat = processImage(input, nextOptions);
	const legacyStart = performance.now();
	const legacy = processImage(input, legacyOptions);
	const legacyRuntime = performance.now() - legacyStart;
	const legacyRepeat = processImage(input, legacyOptions);
	const nextMetrics = calculateMetrics(
		next.result,
		input,
		expected,
		next.grid,
		nextRepeat.result,
		nextRuntime,
	);
	const legacyMetrics = calculateMetrics(
		legacy.result,
		input,
		expected,
		legacy.grid,
		legacyRepeat.result,
		legacyRuntime,
	);
	const metricRegression = compareMetrics(
		nextMetrics,
		baselineFromMetrics(legacyMetrics),
	).regressed;
	const regressedMetrics =
		legacyMetrics.sizeCorrect && !nextMetrics.sizeCorrect
			? ["outputSize", ...metricRegression]
			: metricRegression;
	const directory = qualityCaseDirectory(qualityCase.id);
	const files = {
		next: `${directory}/next-auto.png`,
		legacy: `${directory}/legacy-auto.png`,
		diff: `${directory}/next-vs-legacy.png`,
	};
	if (reportRoot) {
		const outputDirectory = path.join(reportRoot, directory);
		mkdirSync(outputDirectory, { recursive: true });
		writePng(path.join(reportRoot, files.next), next.result);
		writePng(path.join(reportRoot, files.legacy), legacy.result);
		writePng(
			path.join(reportRoot, files.diff),
			createDiffImage(next.result, legacy.result),
		);
	}
	return {
		id: qualityCase.id,
		next: { route: next.analysis.route, metrics: nextMetrics },
		legacy: { route: legacy.analysis.route, metrics: legacyMetrics },
		outputChanged: !imagesEqual(next.result, legacy.result),
		regressedMetrics,
		files,
	};
};

export const summarizeRollout = (
	cases: QualityRolloutCaseResult[],
): QualityRolloutResults => {
	const count = cases.length;
	const average = (
		select: (result: QualityRolloutCaseResult) => number,
	): number => {
		let total = 0;
		for (const result of cases) total += select(result);
		return count === 0 ? 0 : total / count;
	};
	return {
		summary: {
			caseCount: count,
			outputChanged: cases.filter((result) => result.outputChanged).length,
			routeChanged: cases.filter(
				(result) => result.next.route !== result.legacy.route,
			).length,
			regressed: cases.filter((result) => result.regressedMetrics.length > 0)
				.length,
			nextTop1SizeAccuracy: average((result) =>
				Number(result.next.metrics.sizeCorrect),
			),
			legacyTop1SizeAccuracy: average((result) =>
				Number(result.legacy.metrics.sizeCorrect),
			),
			nextTop3SizeAccuracy: average((result) =>
				Number(result.next.metrics.top3SizeCorrect),
			),
			legacyTop3SizeAccuracy: average((result) =>
				Number(result.legacy.metrics.top3SizeCorrect),
			),
			nextByteIdentityRate: average((result) =>
				Number(result.next.metrics.byteIdentical),
			),
			nextCatastrophicFailureRate: average((result) =>
				Number(result.next.metrics.catastrophicFailure),
			),
			legacyCatastrophicFailureRate: average((result) =>
				Number(result.legacy.metrics.catastrophicFailure),
			),
		},
		cases,
	};
};
