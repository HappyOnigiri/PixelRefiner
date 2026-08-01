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
		const subscores: GridCandidateSubscores = {
			periodicity: preserveCandidate
				? 0
				: 1 /
					(1 +
						Math.max(0, grid.score) /
							PROCESS_ANALYSIS_THRESHOLDS.gridScoreScale),
			edgeAlignment: clampUnit(
				1 - edgeRemainder / Math.max(1, source.width + source.height),
			),
			reconstruction: clampUnit(
				1 -
					baseError *
						PROCESS_ANALYSIS_THRESHOLDS.gridCandidateReconstructionScale,
			),
			complexity: preserveCandidate
				? 0
				: clampUnit(Math.log2(Math.max(1, cellScale)) / 4),
			coverage,
			axisAgreement: axisAgreement(grid),
			// [Intended] A single detector is neutral until PRF-120 adds ensemble votes.
			methodAgreement: 0.5,
			stability: preserveCandidate
				? 0
				: clampUnit((shiftedError - baseError) * 32),
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
		let nearestHarmonic: GridCandidateReport | undefined;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const other of reports) {
			if (other === report || other.method === "preserve") continue;
			const ratioW =
				Math.max(report.grid.cellW, other.grid.cellW) /
				Math.max(1, Math.min(report.grid.cellW, other.grid.cellW));
			const ratioH =
				Math.max(report.grid.cellH, other.grid.cellH) /
				Math.max(1, Math.min(report.grid.cellH, other.grid.cellH));
			const distance =
				Math.abs(ratioW - Math.round(ratioW)) +
				Math.abs(ratioH - Math.round(ratioH));
			if (distance < 0.001 && distance < nearestDistance) {
				nearestHarmonic = other;
				nearestDistance = distance;
			}
		}
		if (nearestHarmonic?.subscores) {
			const harmonicSubscores =
				nearestHarmonic.subscores as GridCandidateSubscores;
			reportSubscores.harmonic = clampUnit(
				0.5 +
					(reportSubscores.reconstruction - harmonicSubscores.reconstruction) *
						0.5,
			);
			report.totalScore = weightedScore(reportSubscores);
		}
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
