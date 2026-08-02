import {
	BACKGROUND_MODEL_LIMITS,
	PROCESS_ANALYSIS_THRESHOLDS,
} from "../shared/config";
import type {
	GridCandidateReport,
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

export const createProcessingAnalysis = (
	source: RawImage,
	result: RawImage,
	comparisonBefore: RawImage,
	grid: PixelGrid,
	route: ProcessingRoute,
	method: string,
	alphaThreshold: number,
	rankedCandidates?: GridCandidateReport[],
	backgroundDiagnostic?: {
		confidence: number;
		contentLossRisk: boolean;
	},
): ProcessingAnalysis => {
	const fallbackSelected = toCandidateReport(grid, source, route, method);
	const gridCandidates = rankedCandidates ?? [fallbackSelected];
	const selectedCandidateIndex = rankedCandidates
		? gridCandidates.findIndex(
				(candidate) =>
					candidate.grid.cellW === grid.cellW &&
					candidate.grid.cellH === grid.cellH &&
					candidate.grid.offsetX === grid.offsetX &&
					candidate.grid.offsetY === grid.offsetY,
			)
		: 0;
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
	if (
		contentLossRatio > PROCESS_ANALYSIS_THRESHOLDS.contentLossRatio ||
		backgroundDiagnostic?.contentLossRisk
	) {
		warnings.push("CONTENT_LOSS_RISK");
	}
	if (
		gridSafety.extremeOutput ||
		result.width > PROCESS_ANALYSIS_THRESHOLDS.extremeOutputDimension ||
		result.height > PROCESS_ANALYSIS_THRESHOLDS.extremeOutputDimension
	) {
		warnings.push("EXTREME_OUTPUT_SIZE");
	}

	return {
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
