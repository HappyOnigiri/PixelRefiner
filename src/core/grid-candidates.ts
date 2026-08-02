import {
	GRID_CANDIDATE_SCORE_WEIGHTS,
	PROCESS_ANALYSIS_THRESHOLDS,
} from "../shared/config";
import type {
	GridCandidateReport,
	GridCandidateSubscores,
	PixelGrid,
	RawImage,
} from "../shared/types";

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const gridGeometry = (grid: PixelGrid, source: RawImage) => {
	const outW =
		grid.outW ??
		Math.max(1, Math.floor((source.width - grid.offsetX) / grid.cellW));
	const outH =
		grid.outH ??
		Math.max(1, Math.floor((source.height - grid.offsetY) / grid.cellH));
	const cropX = grid.cropX ?? grid.offsetX;
	const cropY = grid.cropY ?? grid.offsetY;
	return {
		outW,
		outH,
		cropX,
		cropY,
		cropW: grid.cropW ?? outW * grid.cellW,
		cropH: grid.cropH ?? outH * grid.cellH,
	};
};

const axisAgreement = (grid: PixelGrid): number => {
	if (grid.detectionFailedAxes?.length) return 0;
	if (grid.scoreX === undefined && grid.scoreY === undefined) return 1;
	if (grid.scoreX === undefined || grid.scoreY === undefined) return 0;
	const scale = Math.abs(grid.scoreX) + Math.abs(grid.scoreY) + 1;
	return clampUnit(1 - Math.abs(grid.scoreX - grid.scoreY) / scale);
};

const reconstructionError = (
	source: RawImage,
	grid: PixelGrid,
	offsetDeltaX = 0,
	offsetDeltaY = 0,
): number => {
	const geometry = gridGeometry(grid, source);
	const pixelCount = geometry.cropW * geometry.cropH;
	if (pixelCount <= 0) return 1;
	const sampleStride = Math.max(
		1,
		Math.ceil(
			Math.sqrt(
				pixelCount / PROCESS_ANALYSIS_THRESHOLDS.gridCandidateSampleLimit,
			),
		),
	);
	const cropEndX = Math.min(source.width, geometry.cropX + geometry.cropW);
	const cropEndY = Math.min(source.height, geometry.cropY + geometry.cropH);
	let difference = 0;
	let samples = 0;
	for (let y = Math.max(0, geometry.cropY); y < cropEndY; y += sampleStride) {
		const cellY = Math.floor((y - geometry.cropY) / grid.cellH);
		const centerY = Math.min(
			source.height - 1,
			Math.max(
				0,
				Math.floor(geometry.cropY + (cellY + 0.5) * grid.cellH + offsetDeltaY),
			),
		);
		for (let x = Math.max(0, geometry.cropX); x < cropEndX; x += sampleStride) {
			const cellX = Math.floor((x - geometry.cropX) / grid.cellW);
			const centerX = Math.min(
				source.width - 1,
				Math.max(
					0,
					Math.floor(
						geometry.cropX + (cellX + 0.5) * grid.cellW + offsetDeltaX,
					),
				),
			);
			const sourceIndex = (y * source.width + x) * 4;
			const centerIndex = (centerY * source.width + centerX) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				difference += Math.abs(
					source.data[sourceIndex + channel] -
						source.data[centerIndex + channel],
				);
			}
			samples += 1;
		}
	}
	return samples === 0 ? 1 : difference / (samples * 4 * 255);
};

const isPreserveGrid = (grid: PixelGrid, source: RawImage): boolean => {
	const geometry = gridGeometry(grid, source);
	return (
		grid.cellW === 1 &&
		grid.cellH === 1 &&
		geometry.outW === source.width &&
		geometry.outH === source.height
	);
};

const candidateKey = (grid: PixelGrid, source: RawImage): string => {
	const geometry = gridGeometry(grid, source);
	return [
		grid.cellW,
		grid.cellH,
		grid.offsetX,
		grid.offsetY,
		geometry.outW,
		geometry.outH,
	].join(":");
};

const preserveGrid = (source: RawImage): PixelGrid => ({
	cellW: 1,
	cellH: 1,
	offsetX: 0,
	offsetY: 0,
	score: PROCESS_ANALYSIS_THRESHOLDS.legacyPreserveCandidateScore,
	cropX: 0,
	cropY: 0,
	cropW: source.width,
	cropH: source.height,
	outW: source.width,
	outH: source.height,
});

const weightedScore = (subscores: GridCandidateSubscores): number => {
	let score = 0;
	for (const key of Object.keys(GRID_CANDIDATE_SCORE_WEIGHTS) as Array<
		keyof GridCandidateSubscores
	>) {
		score += subscores[key] * GRID_CANDIDATE_SCORE_WEIGHTS[key];
	}
	return clampUnit(score);
};

export const rankGridCandidates = (
	source: RawImage,
	selectedGrid: PixelGrid,
	method: string,
): GridCandidateReport[] => {
	const grids = [selectedGrid, ...(selectedGrid.candidates ?? [])];
	const preserve = preserveGrid(source);
	grids.push(preserve);
	const unique: PixelGrid[] = [];
	const seen = new Set<string>();
	for (const grid of grids) {
		const key = candidateKey(grid, source);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(grid);
	}

	const reports: GridCandidateReport[] = [];
	for (const grid of unique) {
		const geometry = gridGeometry(grid, source);
		const preserveCandidate = isPreserveGrid(grid, source);
		const baseError = reconstructionError(source, grid);
		let shiftedError = baseError;
		if (!preserveCandidate && (grid.cellW > 1 || grid.cellH > 1)) {
			shiftedError = Math.min(
				reconstructionError(source, grid, 1, 0),
				reconstructionError(source, grid, 0, 1),
			);
		}
		const sourceArea = Math.max(1, source.width * source.height);
		const outputArea = geometry.outW * geometry.outH;
		const coverage = clampUnit((geometry.cropW * geometry.cropH) / sourceArea);
		const edgeRemainder =
			Math.abs(source.width - (geometry.cropX + geometry.cropW)) +
			Math.abs(source.height - (geometry.cropY + geometry.cropH));
		const cellScale = Math.sqrt(grid.cellW * grid.cellH);
		const signalScores = grid.signalScores;
		// [Intended] アンサンブルを実行しない旧検出器では、未計測信号を否定票にしない。
		const unmeasuredSignalScore = 0.5;
		const subscores: GridCandidateSubscores = {
			colorBoundary: preserveCandidate
				? 0
				: (signalScores?.colorBoundary ?? unmeasuredSignalScore),
			luminanceGradient: preserveCandidate
				? 0
				: (signalScores?.luminanceGradient ?? unmeasuredSignalScore),
			alphaGradient: preserveCandidate
				? 0
				: (signalScores?.alphaGradient ?? unmeasuredSignalScore),
			autocorrelation: preserveCandidate
				? 0
				: (signalScores?.autocorrelation ?? unmeasuredSignalScore),
			localPhaseStability: preserveCandidate
				? 0
				: (signalScores?.localPhaseStability ?? unmeasuredSignalScore),
			periodicity: preserveCandidate
				? 0
				: 1 /
					(1 +
						Math.max(0, grid.score) /
							PROCESS_ANALYSIS_THRESHOLDS.gridScoreScale),
			edgeAlignment: clampUnit(
				1 - edgeRemainder / Math.max(1, source.width + source.height),
			),
			reconstruction:
				signalScores?.reconstruction ??
				clampUnit(
					1 -
						baseError *
							PROCESS_ANALYSIS_THRESHOLDS.gridCandidateReconstructionScale,
				),
			complexity: preserveCandidate
				? 0
				: clampUnit(Math.log2(Math.max(1, cellScale)) / 4),
			coverage,
			axisAgreement: axisAgreement(grid),
			methodAgreement: preserveCandidate
				? 0
				: (signalScores?.methodAgreement ?? 0.5),
			stability: preserveCandidate
				? 0
				: (signalScores?.localPhaseStability ??
					clampUnit((shiftedError - baseError) * 32)),
			harmonic: 0.5,
			outputSize:
				outputArea <= 1 || outputArea > sourceArea ? 0 : clampUnit(coverage),
		};
		const { candidates: _candidates, ...reportGrid } = grid;
		reports.push({
			grid: reportGrid,
			...geometry,
			method: preserveCandidate ? "preserve" : method,
			totalScore: preserveCandidate ? 0 : weightedScore(subscores),
			confidence: 0,
			subscores,
		});
	}
	for (const report of reports) {
		if (report.method === "preserve" || !report.subscores) continue;
		const reportSubscores = report.subscores as GridCandidateSubscores;
		let harmonicScore = 0.5;
		for (const other of reports) {
			if (other === report || other.method === "preserve") continue;
			if (!other.subscores) continue;
			const ratioW = report.grid.cellW / Math.max(1, other.grid.cellW);
			const ratioH = report.grid.cellH / Math.max(1, other.grid.cellH);
			const factorW = Math.round(ratioW);
			const factorH = Math.round(ratioH);
			if (
				factorW < 2 ||
				factorW > 3 ||
				factorH < 2 ||
				factorH > 3 ||
				Math.abs(ratioW - factorW) > 0.02 ||
				Math.abs(ratioH - factorH) > 0.02
			)
				continue;
			const smaller = other.subscores as GridCandidateSubscores;
			const reconstructionGain =
				reportSubscores.reconstruction - smaller.reconstruction;
			// [Intended] 2倍・3倍周期は、再構成が明確に良い場合だけ基礎周期を上回れる。
			harmonicScore = Math.min(
				harmonicScore,
				clampUnit(0.25 + reconstructionGain * 2),
			);
		}
		reportSubscores.harmonic = harmonicScore;
		report.totalScore = weightedScore(reportSubscores);
	}

	reports.sort(
		(left, right) =>
			right.totalScore - left.totalScore ||
			left.outW - right.outW ||
			left.outH - right.outH,
	);
	const rankedGridReports = reports.filter(
		(report) => report.method !== "preserve",
	);
	for (let index = 0; index < rankedGridReports.length; index += 1) {
		const report = rankedGridReports[index];
		const runnerUp = rankedGridReports[index + 1];
		const margin = runnerUp
			? clampUnit(report.totalScore - runnerUp.totalScore)
			: report.totalScore;
		report.confidence =
			clampUnit(
				report.totalScore * 0.7 +
					margin * 0.2 +
					(report.subscores?.stability ?? 0) * 0.1,
			) * (report.subscores?.axisAgreement ?? 0);
	}
	return reports;
};
