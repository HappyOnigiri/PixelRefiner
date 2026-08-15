import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
	createBuiltInPresetOptions,
	createQuickProcessOptions,
	QUICK_SETTINGS_DEFAULTS,
} from "../../src/browser/quick-settings";
import { processBatchImages } from "../../src/core/batch";
import { evaluateCandidateModalDecision } from "../../src/core/candidate-modal-decision";
import {
	candidateProcessOptions,
	selectCandidatePlans,
} from "../../src/core/candidate-previews";
import { processImage } from "../../src/core/processor";
import type { ProcessOptions } from "../../src/core/processor-options";
import { PROCESS_DEFAULTS } from "../../src/shared/config";
import type { CandidateSelection, RawImage } from "../../src/shared/types";
import { AUTO_CASE_OPTIONS } from "./auto-cases";
import {
	baselineImagePath,
	checkedInBaselineImagePath,
	loadBaseline,
} from "./baseline";
import { classifyChange, compareImages, compareMetrics } from "./comparison";
import { imagesEqual, readPng, writePng } from "./image";
import { caseParameterMode, qualityCaseDirectory } from "./manifest";
import {
	calculateMetrics,
	calculateTargetMetrics,
	createBackgroundMaskImage,
	createDiffImage,
	diffImageSize,
	targetQualityFailures,
} from "./metrics";
import {
	autoTargetSource,
	caseTargetExpectation,
	caseTargetImage,
} from "./targets";
import type {
	QualityBaselineCase,
	QualityCandidateOption,
	QualityCaseResult,
	QualityImageCase,
	QualityImageSize,
} from "./types";

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
	// [Intended] プリセット指定のケースは fixture 用の背景抽出指定も混ぜず、出荷される
	// プリセットの値だけで処理する。ガイドの手順どおりに操作した結果を再現するのが目的で、
	// テスト都合の指定が 1 つでも入ると、掲載画像との一致が手順の裏付けにならなくなる。
	if (qualityCase.presetId !== undefined)
		return createBuiltInPresetOptions(qualityCase.presetId);
	// [Intended] かんたん設定のケースもプリセットと同じく fixture 用の背景抽出指定を混ぜず、
	// 案内された操作だけから作ったオプションで処理する。
	if (qualityCase.quickSettings !== undefined)
		return createQuickProcessOptions({
			...QUICK_SETTINGS_DEFAULTS,
			...qualityCase.quickSettings,
		});
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

const runQualityCasePair = (qualityCase: QualityImageCase) => {
	const inputPath = path.resolve(qualityCase.input);
	const input = readPng(inputPath);
	const effectiveOptions = effectiveCaseOptions(qualityCase);
	const options = { ...effectiveOptions, debug: false };
	const start = performance.now();
	const currentRun = processQualityCase(qualityCase, input, options);
	const runtime = performance.now() - start;
	const repeatRun = processQualityCase(qualityCase, input, options);
	return {
		inputPath,
		input,
		effectiveOptions,
		options,
		currentRun,
		repeatRun,
		runtime,
	};
};

/**
 * 候補選択モーダルに並ぶ選択肢を、ブラウザと同じ候補プラン・同じ入力画像から作る。
 *
 * [Intended] ブラウザはサムネイルへ縮小した画像を並べるが、レポートには他の画像と同じ
 * 原寸で書き出す。縮小は表示側の image-stage が行うので、選択肢の実出力を等倍で確認できる。
 * [Intended] 1 候補の生成失敗で残りの選択肢を捨てない。ブラウザも失敗した候補だけを落として
 * 表示を続けるため、レポートも欠番として残し、生成できなかった事実を読めるようにする。
 */
const buildCandidateOptions = (
	plans: readonly CandidateSelection[],
	input: RawImage,
	options: ProcessOptions,
	caseDirectory: string,
): QualityCandidateOption[] =>
	plans.map((plan) => {
		const identity = {
			id: plan.id,
			kind: plan.kind,
			recommended: plan.recommended,
			processingMode: plan.processingMode,
		};
		try {
			const processed = processImage(
				input,
				candidateProcessOptions(options, plan),
			);
			const file = `${caseDirectory}/candidate-${plan.kind}.png`;
			writePng(path.join(REPORT_ROOT, file), processed.result);
			return {
				...identity,
				outputWidth: processed.result.width,
				outputHeight: processed.result.height,
				colorCount: processed.extractedPalette.length,
				file,
			};
		} catch {
			return {
				...identity,
				outputWidth: null,
				outputHeight: null,
				colorCount: null,
				file: null,
			};
		}
	});

const imageSize = (image: RawImage): QualityImageSize => ({
	width: image.width,
	height: image.height,
});

/** 存在しない画像を持つキー用。files の null 許容と対応させる。 */
const optionalImageSize = (image: RawImage | null): QualityImageSize | null =>
	image === null ? null : imageSize(image);

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

const toBaselineCaseEntry = (
	id: string,
	status: QualityBaselineCase["status"],
	metrics: ReturnType<typeof calculateMetrics>,
): QualityBaselineCase => ({
	id,
	status,
	outputWidth: metrics.outputWidth,
	outputHeight: metrics.outputHeight,
	meanRgbaError: Number(metrics.meanRgbaError.toFixed(6)),
	edgeF1: Number(metrics.edgeF1.toFixed(6)),
	backgroundMaskIou: Number(metrics.backgroundMaskIou.toFixed(6)),
	smallComponentRetention: Number(metrics.smallComponentRetention.toFixed(6)),
	catastrophicFailure: metrics.catastrophicFailure,
});

export const evaluateQualityCase = (
	qualityCase: QualityImageCase,
	writeArtifacts = false,
): {
	result: QualityCaseResult;
	checkedInBaselineMatches: boolean;
	checkedInBaselineEntry: QualityBaselineCase;
} => {
	const parameterMode = caseParameterMode(qualityCase);
	const {
		inputPath,
		input,
		effectiveOptions,
		options,
		currentRun,
		repeatRun,
		runtime,
	} = runQualityCasePair(qualityCase);

	const storedBaselinePath = baselineImagePath(qualityCase.id);
	const baselineImage = existsSync(storedBaselinePath)
		? readPng(storedBaselinePath)
		: null;
	// [Intended] ゲートと baseline.json が使う基準は従来どおり。自動判定ケースは承認済み
	// ベースライン画像、explicit ケースはケース定義の正解画像で、ベースライン未登録の初回
	// だけは自身の出力を基準にして「新規」として扱う。目標画像は下の targetMetrics で
	// 別に測る。ここへ混ぜると指標の意味が変わり、既存ベースラインとの比較が壊れる。
	const expected =
		parameterMode === "auto"
			? (baselineImage ?? currentRun.result)
			: readPng(path.resolve(qualityCase.expected ?? ""));
	const targetPath = caseTargetImage(qualityCase);
	const targetImage =
		targetPath === undefined ? null : readPng(path.resolve(targetPath));
	const targetMetrics =
		targetImage === null
			? null
			: calculateTargetMetrics(currentRun.result, targetImage);
	const targetExpectation =
		targetImage === null ? null : (caseTargetExpectation(qualityCase) ?? null);

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
	const checkedInPath = checkedInBaselineImagePath(qualityCase.id);
	const checkedInImage = existsSync(checkedInPath)
		? readPng(checkedInPath)
		: null;
	const checkedInExpected =
		parameterMode === "auto" ? (checkedInImage ?? currentRun.result) : expected;
	// [Intended] explicit ケースと、PR ベースへの差し替えが無いローカル実行では、
	// 参照画像がゲート側の expected と同一インスタンスになる。同じ参照で測り直しても
	// 結果は変わらないので判定一式を使い回し、同じ 3 段のロジックを 2 組持たない。
	const checkedInSharesReference = checkedInExpected === expected;
	const checkedInMetrics = checkedInSharesReference
		? metrics
		: calculateMetrics(
				currentRun.result,
				input,
				checkedInExpected,
				currentRun.grid,
				repeatRun.result,
				runtime,
			);
	const checkedInFailed = checkedInSharesReference
		? failed
		: failedAssertions(
				qualityCase,
				checkedInMetrics,
				imagesEqual(currentRun.result, checkedInExpected),
			);
	const checkedInStatus = checkedInFailed.length === 0 ? "passed" : "failed";
	const checkedInBaselineEntry = toBaselineCaseEntry(
		qualityCase.id,
		checkedInStatus,
		checkedInMetrics,
	);
	const targetFailedAssertions =
		targetMetrics === null || targetExpectation === null
			? []
			: targetQualityFailures(
					targetMetrics,
					targetExpectation,
					currentRun.result.width,
					currentRun.result.height,
					metrics.byteIdentical,
				);
	const targetStatus =
		targetMetrics === null || targetExpectation === null
			? "missing"
			: targetFailedAssertions.length === 0
				? "met"
				: "unmet";
	const baseline = loadBaseline();
	const baselineMetrics =
		baseline.cases.find((baselineCase) => baselineCase.id === qualityCase.id) ??
		null;
	const imageComparison = compareImages(currentRun.result, baselineImage);
	const metricComparison = compareMetrics(metrics, baselineMetrics, status);
	const changeStatus = classifyChange(
		baselineImage !== null,
		imageComparison.changed,
	);
	const caseDirectory = qualityCaseDirectory(qualityCase.id);
	const files = {
		groundTruth:
			targetImage === null ? null : `${caseDirectory}/ground-truth.png`,
		input: `${caseDirectory}/input.png`,
		baseline: baselineImage === null ? null : `${caseDirectory}/baseline.png`,
		result: `${caseDirectory}/result.png`,
		diff: targetImage === null ? null : `${caseDirectory}/diff.png`,
		baselineDiff:
			baselineImage === null ? null : `${caseDirectory}/baseline-diff.png`,
		backgroundMask: `${caseDirectory}/background-mask.png`,
	};
	const imageSizes = {
		groundTruth: optionalImageSize(targetImage),
		input: imageSize(input),
		baseline: optionalImageSize(baselineImage),
		result: imageSize(currentRun.result),
		diff:
			targetImage === null
				? null
				: diffImageSize(currentRun.result, targetImage),
		baselineDiff:
			baselineImage === null
				? null
				: diffImageSize(currentRun.result, baselineImage),
		// [Intended] 背景マスクは出力画像から作るので、常に出力と同じ寸法になる。
		backgroundMask: imageSize(currentRun.result),
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
	// [Intended] 表示見込みの判定には候補プレビューの生成結果を挟まず、UI 初回 Auto 処理と
	// 同じ候補プラン数だけを根拠にする。ここでの判定は実際にモーダルを開いた事実ではなく、
	// 候補生成の失敗を含まない決定論的な診断である。選択肢の画像は判定後に別途生成する。
	const candidatePlans = selectCandidatePlans(currentRun.analysis);
	const candidatePlanCount = candidatePlans.length;
	const candidateModal = evaluateCandidateModalDecision({
		isAuto: effectiveOptions.processingMode === "auto",
		isInitial: true,
		showCandidates: true,
		hasCandidateSelection: false,
		warningCodes: currentRun.analysis.warnings,
		candidatePreviewCount: candidatePlanCount,
	});
	// [Policy] 候補の再処理はレポート生成時だけ行う。品質ゲートは候補選択を判定に使わないので、
	// ゲート実行へ候補 1 件あたり 1 回の追加処理を持ち込まない。
	let candidateOptions: QualityCandidateOption[] = [];
	if (writeArtifacts) {
		const outputDirectory = path.join(REPORT_ROOT, caseDirectory);
		mkdirSync(outputDirectory, { recursive: true });
		if (targetPath !== undefined && files.groundTruth) {
			cpSync(
				path.resolve(targetPath),
				path.join(REPORT_ROOT, files.groundTruth),
			);
		}
		cpSync(inputPath, path.join(REPORT_ROOT, files.input));
		if (files.baseline && baselineImage) {
			writePng(path.join(REPORT_ROOT, files.baseline), baselineImage);
		}
		writePng(path.join(REPORT_ROOT, files.result), currentRun.result);
		if (files.diff && targetImage) {
			writePng(
				path.join(REPORT_ROOT, files.diff),
				createDiffImage(currentRun.result, targetImage),
			);
		}
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
		if (candidateModal.candidateModalDecision === "would-show") {
			candidateOptions = buildCandidateOptions(
				candidatePlans,
				input,
				options,
				caseDirectory,
			);
		}
	}
	const result: QualityCaseResult = {
		id: qualityCase.id,
		featureIds: qualityCase.featureIds,
		parameterMode,
		inputKind: qualityCase.inputKind,
		degradationPatterns: qualityCase.degradationPatterns,
		status,
		targetStatus,
		targetFailedAssertions,
		targetExpectation,
		changeStatus,
		failedAssertions: failed,
		regressedMetrics: metricComparison.regressed,
		improvedMetrics: metricComparison.improved,
		changedPixelCount: imageComparison.changedPixelCount,
		changedPixelRate: imageComparison.changedPixelRate,
		diffBoundingBox: imageComparison.diffBoundingBox,
		classification: currentRun.analysis.classification ?? qualityCase.inputKind,
		route: currentRun.analysis.route,
		classificationConfidence:
			currentRun.analysis.classificationConfidence ?? null,
		confidence: currentRun.analysis.confidence,
		gridConfidence: currentRun.analysis.confidence,
		warnings: currentRun.analysis.warnings,
		candidateModalDecision: candidateModal.candidateModalDecision,
		candidateModalReason: candidateModal.candidateModalReason,
		warningPresentation: candidateModal.warningPresentation,
		candidatePlanCount,
		candidateOptions,
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
		targetMetrics,
		targetSource:
			parameterMode === "auto"
				? (autoTargetSource(qualityCase.id) ?? null)
				: null,
		files,
		imageSizes,
	};
	return {
		result,
		checkedInBaselineMatches:
			checkedInImage !== null && imagesEqual(currentRun.result, checkedInImage),
		checkedInBaselineEntry,
	};
};

export const runQualityCase = (
	qualityCase: QualityImageCase,
	writeArtifacts = false,
): QualityCaseResult => evaluateQualityCase(qualityCase, writeArtifacts).result;

/**
 * 更新後の画像そのものを参照にして、保存用の画像と指標を同じ処理結果から作る。
 * [Intended] auto ケースの保存指標を旧 baseline との比較値から作ると、画像を差し替えた
 * 直後から baseline.json だけが不整合になるため、新しい画像を自己参照にする。
 * この自己参照により、auto ケースの保存 catastrophicFailure は出力単体で判定できる条件
 * （1px 寸法・過大な面積）だけを表し、不透明画素の消失では立たない。消失は PR ベースを
 * 基準にするゲート比較で捕まえる。
 */
export const generateQualityBaseline = (
	qualityCase: QualityImageCase,
): { entry: QualityBaselineCase; image: RawImage } => {
	const parameterMode = caseParameterMode(qualityCase);
	const { input, currentRun, repeatRun, runtime } =
		runQualityCasePair(qualityCase);
	const expected =
		parameterMode === "auto"
			? currentRun.result
			: readPng(path.resolve(qualityCase.expected ?? ""));
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
	return {
		entry: toBaselineCaseEntry(
			qualityCase.id,
			failed.length === 0 ? "passed" : "failed",
			metrics,
		),
		image: currentRun.result,
	};
};

export const writeQualityBaselineImage = (
	outputPath: string,
	image: RawImage,
): void => writePng(outputPath, image);

export const reportRoot = REPORT_ROOT;
