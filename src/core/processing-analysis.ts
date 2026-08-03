import {
	BACKGROUND_MODEL_LIMITS,
	PROCESS_ANALYSIS_THRESHOLDS,
} from "../shared/config";
import type {
	BackgroundDiagnostic,
	GridCandidateReport,
	InputClassificationResult,
	PixelGrid,
	ProcessingAnalysis,
	ProcessingRoute,
	ProcessingWarningCode,
	RawImage,
} from "../shared/types";

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const foregroundRatio = (img: RawImage, alphaThreshold: number): number => {
	const pixelCount = img.width * img.height;
	if (pixelCount === 0) return 0;
	let foregroundCount = 0;
	for (let i = 3; i < img.data.length; i += 4) {
		if (img.data[i] >= alphaThreshold) foregroundCount += 1;
	}
	return foregroundCount / pixelCount;
};

const getAxisAgreement = (grid: PixelGrid): number => {
	if (grid.detectionFailedAxes && grid.detectionFailedAxes.length > 0) return 0;
	if (grid.scoreX === undefined || grid.scoreY === undefined) return 1;
	const denominator = Math.abs(grid.scoreX) + Math.abs(grid.scoreY) + 1;
	return clampUnit(1 - Math.abs(grid.scoreX - grid.scoreY) / denominator);
};

type GridSafety = {
	extremeOutput: boolean;
	lowConfidence: boolean;
	confidenceFactor: number;
};

const getGridSafety = (grid: PixelGrid, source: RawImage): GridSafety => {
	const outW =
		grid.outW ??
		Math.max(1, Math.floor((source.width - grid.offsetX) / grid.cellW));
	const outH =
		grid.outH ??
		Math.max(1, Math.floor((source.height - grid.offsetY) / grid.cellH));
	const sourceArea = source.width * source.height;
	const outputArea = outW * outH;
	const degenerateOutput = outW <= 1 || outH <= 1;
	const tinyOutput =
		sourceArea >= PROCESS_ANALYSIS_THRESHOLDS.minLargeInputArea &&
		outputArea <= PROCESS_ANALYSIS_THRESHOLDS.minSafeOutputArea;
	const minCell = Math.max(1, Math.min(grid.cellW, grid.cellH));
	const cellAspectRatio = Math.max(grid.cellW, grid.cellH) / minCell;
	const unusualCellAspect =
		cellAspectRatio > PROCESS_ANALYSIS_THRESHOLDS.maxCellAspectRatio;
	let divergentAxisScores = false;
	if (grid.scoreX !== undefined && grid.scoreY !== undefined) {
		const scoreScale = Math.abs(grid.scoreX) + Math.abs(grid.scoreY) + 1;
		divergentAxisScores =
			Math.abs(grid.scoreX - grid.scoreY) / scoreScale >
			PROCESS_ANALYSIS_THRESHOLDS.maxAxisScoreDifferenceRatio;
	}
	const extremeOutput = degenerateOutput || tinyOutput || unusualCellAspect;
	const lowConfidence = extremeOutput || divergentAxisScores;
	return {
		extremeOutput,
		lowConfidence,
		confidenceFactor: lowConfidence ? 0.1 : 1,
	};
};

/**
 * 検出グリッド由来の低信頼シグナルを警告コードとして返す。
 *
 * [Intended] preserve 経路の診断はセル 1x1 の合成グリッドで行うため、
 * 検出側で得た低信頼シグナルが analysis.warnings から落ちる。警告が無いと
 * 候補選択も警告通知も出ず、縮小候補があることをユーザーへ伝えられないため、
 * auto が preserve を選んだ場合はこの警告を補って渡す。
 */
export const detectedGridConfidenceWarnings = (
	source: RawImage,
	grid: PixelGrid,
	selectedGridConfidence: number | undefined,
): ProcessingWarningCode[] => {
	// [Intended] 検出グリッドが原寸と同じ出力しか生まないなら提示できる候補が無い。
	if (grid.outW === source.width && grid.outH === source.height) return [];
	const warnings: ProcessingWarningCode[] = [];
	const failedAxes = grid.detectionFailedAxes?.length ?? 0;
	if (failedAxes === 1) warnings.push("ONE_AXIS_DETECTION_FAILED");
	const lowConfidence =
		selectedGridConfidence === undefined ||
		selectedGridConfidence <
			PROCESS_ANALYSIS_THRESHOLDS.gridCandidateConfidenceThreshold;
	if (
		failedAxes > 0 ||
		lowConfidence ||
		getGridSafety(grid, source).lowConfidence
	) {
		warnings.push("LOW_GRID_CONFIDENCE");
	}
	return warnings;
};

const getGridConfidence = (
	grid: PixelGrid,
	route: ProcessingRoute,
	source: RawImage,
): number => {
	if (route !== "refine") return 1;
	const scoreConfidence =
		1 /
		(1 + Math.max(0, grid.score) / PROCESS_ANALYSIS_THRESHOLDS.gridScoreScale);
	const safety = getGridSafety(grid, source);
	return clampUnit(
		scoreConfidence * getAxisAgreement(grid) * safety.confidenceFactor,
	);
};

const toCandidateReport = (
	grid: PixelGrid,
	source: RawImage,
	route: ProcessingRoute,
	method: string,
) => {
	const outW =
		grid.outW ??
		Math.max(1, Math.floor((source.width - grid.offsetX) / grid.cellW));
	const outH =
		grid.outH ??
		Math.max(1, Math.floor((source.height - grid.offsetY) / grid.cellH));
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	const cropW = grid.cropW ?? outW * grid.cellW;
	const cropH = grid.cropH ?? outH * grid.cellH;
	const axisAgreement = getAxisAgreement(grid);
	const { candidates: _candidates, ...reportGrid } = grid;

	return {
		grid: reportGrid,
		outW,
		outH,
		cropX,
		cropY,
		cropW,
		cropH,
		method,
		totalScore: grid.score,
		confidence: getGridConfidence(grid, route, source),
		subscores: { axisAgreement },
	};
};

// 適用グリッドと同じセル寸法・オフセットを持つ候補の位置。見つからなければ -1。
export const findCandidateIndexForGrid = (
	candidates: GridCandidateReport[],
	grid: PixelGrid,
): number =>
	candidates.findIndex(
		(candidate) =>
			candidate.grid.cellW === grid.cellW &&
			candidate.grid.cellH === grid.cellH &&
			candidate.grid.offsetX === grid.offsetX &&
			candidate.grid.offsetY === grid.offsetY,
	);

export const createProcessingAnalysis = (
	source: RawImage,
	result: RawImage,
	comparisonBefore: RawImage,
	grid: PixelGrid,
	route: ProcessingRoute,
	method: string,
	alphaThreshold: number,
	rankedCandidates?: GridCandidateReport[],
	backgroundDiagnostic?: BackgroundDiagnostic,
	classificationResult?: InputClassificationResult,
	additionalWarnings: ProcessingWarningCode[] = [],
	/**
	 * 候補配列上の採用位置。
	 * [Policy] セル寸法が同一へ丸まる候補があると grid の一致検索では区別できないため、
	 * 呼び出し元が採用位置を知っている経路はここで明示する。
	 */
	knownSelectedCandidateIndex?: number,
): ProcessingAnalysis => {
	const fallbackSelected = toCandidateReport(grid, source, route, method);
	const gridCandidates = rankedCandidates ?? [fallbackSelected];
	const selectedCandidateIndex =
		knownSelectedCandidateIndex ??
		(rankedCandidates ? findCandidateIndexForGrid(gridCandidates, grid) : 0);
	const selected =
		selectedCandidateIndex >= 0
			? gridCandidates[selectedCandidateIndex]
			: fallbackSelected;
	const selectionConfirmed =
		route !== "refine" ||
		(selectedCandidateIndex >= 0 &&
			selected.confidence >=
				PROCESS_ANALYSIS_THRESHOLDS.gridCandidateConfidenceThreshold);

	const before = foregroundRatio(comparisonBefore, alphaThreshold);
	const after = foregroundRatio(result, alphaThreshold);
	const contentLossRatio =
		before === 0 ? 0 : clampUnit((before - after) / before);
	const warnings: ProcessingWarningCode[] = [];
	if (
		backgroundDiagnostic &&
		backgroundDiagnostic.confidence < BACKGROUND_MODEL_LIMITS.minConfidence
	) {
		warnings.push("BACKGROUND_UNCERTAIN");
	}
	// [Intended] ロールバック時は背景が透過されなかっただけで内容は失われていないため、
	// CONTENT_LOSS_RISK ではなく専用の警告で「背景透過を中止した」ことを伝える。
	if (backgroundDiagnostic?.removalRolledBack) {
		warnings.push("BACKGROUND_REMOVAL_SKIPPED");
	}
	if (before === 0) warnings.push("NO_CONTENT");
	if (grid.detectionFailedAxes?.length === 1) {
		warnings.push("ONE_AXIS_DETECTION_FAILED");
	}
	const gridSafety = getGridSafety(grid, source);
	if (
		gridSafety.lowConfidence ||
		!selectionConfirmed ||
		(grid.detectionFailedAxes?.length ?? 0) > 0
	) {
		warnings.push("LOW_GRID_CONFIDENCE");
	}
	if (contentLossRatio > PROCESS_ANALYSIS_THRESHOLDS.contentLossRatio) {
		warnings.push("CONTENT_LOSS_RISK");
	}
	if (
		gridSafety.extremeOutput ||
		result.width > PROCESS_ANALYSIS_THRESHOLDS.extremeOutputDimension ||
		result.height > PROCESS_ANALYSIS_THRESHOLDS.extremeOutputDimension
	) {
		warnings.push("EXTREME_OUTPUT_SIZE");
	}
	for (let i = 0; i < additionalWarnings.length; i += 1) {
		if (!warnings.includes(additionalWarnings[i])) {
			warnings.push(additionalWarnings[i]);
		}
	}

	return {
		classification: classificationResult?.classification,
		classificationFeatures: classificationResult?.features,
		classificationReasons: classificationResult?.reasons,
		classificationConfidence: classificationResult?.confidence,
		route,
		confidence: selected.confidence,
		warnings,
		gridCandidates,
		// [Intended] PRF-100 は信頼度が低い場合に自動確定を行わない。
		// PRF-300 が経路選択を担うまで、旧来の出力は利用可能なままとする。
		selectedCandidateIndex: selectionConfirmed
			? Math.max(0, selectedCandidateIndex)
			: undefined,
		foregroundRatioBefore: before,
		foregroundRatioAfter: after,
		contentLossRatio,
		backgroundConfidence: backgroundDiagnostic?.confidence,
	};
};
