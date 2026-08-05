import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { processBatchImages } from "../../src/core/batch";
import { processImage } from "../../src/core/processor";
import type { ProcessOptions } from "../../src/core/processor-options";
import { PROCESS_DEFAULTS } from "../../src/shared/config";
import { AUTO_CASE_OPTIONS } from "./auto-cases";
import { baselineImagePath, loadBaseline } from "./baseline";
import { classifyChange, compareImages, compareMetrics } from "./comparison";
import { imagesEqual, readPng, writePng } from "./image";
import { caseParameterMode, qualityCaseDirectory } from "./manifest";
import {
	calculateMetrics,
	createBackgroundMaskImage,
	createDiffImage,
} from "./metrics";
import type { QualityCaseResult, QualityImageCase } from "./types";

const REPORT_ROOT = path.resolve("tmp/quality-report/latest");

// [Intended] 背景抽出だけは fixture 作成時の方式に固定する。処理経路は固定しない。
// 経路まで固定すると出荷される既定経路（auto）が品質ゲートの検証対象から外れるため、
// 特定経路の出力を固定したいケースは cases.json 側で processingMode を明示する。
const QUALITY_FIXTURE_OPTIONS = {
	bgExtractionMethod: "top-left",
} as const;

// [Intended] 省略時に効く既定経路をレポートへ明示的に残すため、既定値も展開して返す。
// 値は PROCESS_DEFAULTS から取るので、既定が変わればケースの実行経路も追随する。
const effectiveCaseOptions = (
	qualityCase: QualityImageCase,
): ProcessOptions => {
	// [Intended] 自動判定ケースは UI 既定だけで処理する。fixture 用の背景抽出指定すら
	// 混ぜないのは、UI を触らずに 1 枚渡した場合の判定精度を測るのが目的だから。
	if (caseParameterMode(qualityCase) === "auto")
		return { ...AUTO_CASE_OPTIONS };
	return {
		...QUALITY_FIXTURE_OPTIONS,
		processingMode: PROCESS_DEFAULTS.processingMode,
		...qualityCase.options,
	};
};

const processQualityCase = (
	qualityCase: QualityImageCase,
	input: ReturnType<typeof readPng>,
	options: ProcessOptions,
): ReturnType<typeof processImage> => {
	if (!qualityCase.sharedPalette) return processImage(input, options);
	const images = [
		input,
		...qualityCase.sharedPalette.inputs.map((file) =>
			readPng(path.resolve(file)),
		),
	];
	const batch = processBatchImages(
		images.map((image, index) => ({ id: String(index), image, options })),
		{
			sharedPalette: true,
			colorCount: qualityCase.sharedPalette.colorCount,
			ditherMode: qualityCase.sharedPalette.ditherMode,
			ditherStrength: qualityCase.sharedPalette.ditherStrength,
		},
	);
	const primary = batch.items[0];
	if (!primary || primary.status === "error") {
		throw new Error(
			primary?.status === "error"
				? primary.error
				: "Shared-palette quality case produced no primary result",
		);
	}
	return primary.processResult;
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
	const parameterMode = caseParameterMode(qualityCase);
	const inputPath = path.resolve(qualityCase.input);
	const input = readPng(inputPath);
	const effectiveOptions = effectiveCaseOptions(qualityCase);
	const options = { ...effectiveOptions, debug: false };

	const start = performance.now();
	const currentRun = processQualityCase(qualityCase, input, options);
	const runtime = performance.now() - start;
	const repeatRun = processQualityCase(qualityCase, input, options);

	const storedBaselinePath = baselineImagePath(qualityCase.id);
	const baselineImage = existsSync(storedBaselinePath)
		? readPng(storedBaselinePath)
		: null;
	// [Intended] 自動判定ケースの基準は承認済みベースライン画像。正解画像を持たないため、
	// ベースライン未登録の初回だけは自身の出力を基準にして「新規」として扱う。
	const expectedPath =
		parameterMode === "auto"
			? baselineImage === null
				? null
				: storedBaselinePath
			: path.resolve(qualityCase.expected ?? "");
	const expected =
		parameterMode === "auto"
			? (baselineImage ?? currentRun.result)
			: readPng(expectedPath ?? "");

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
		groundTruth:
			expectedPath === null ? null : `${caseDirectory}/ground-truth.png`,
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
		if (expectedPath !== null && files.groundTruth) {
			cpSync(expectedPath, path.join(REPORT_ROOT, files.groundTruth));
		}
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
		parameterMode,
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
		// [Intended] レポートには実行に使った合成後のオプションを載せる。ケース定義だけを
		// 載せると fixture 既定や省略時の既定経路が抜け、表示された値での再実行が
		// レポートの測定結果を再現しない。
		options: qualityCase.sharedPalette
			? { ...effectiveOptions, sharedPalette: qualityCase.sharedPalette }
			: effectiveOptions,
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
	const options = { ...effectiveCaseOptions(qualityCase), debug: false };
	writePng(outputPath, processQualityCase(qualityCase, input, options).result);
};

export const reportRoot = REPORT_ROOT;
