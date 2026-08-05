import {
	DESKEW_LIMITS,
	GRID_SEARCH_LIMITS,
	GRID_SIGNAL_DEFAULTS,
} from "../shared/config";
import type {
	GridSignalOptions,
	GridSignalScores,
	PixelGrid,
	RawImage,
} from "../shared/types";
import {
	createDeskewAnalysisImage,
	createDeskewAngles,
	rotateRawImageExpanded,
	scoreDeskewAngles,
} from "./deskew";
import { applyHarmonicPenalties } from "./grid-signals/harmonics";
import {
	type AxisSignalProfile,
	type AxisSignalScores,
	combineSignalProfiles,
	createAxisSignalProfile,
	createLinearLuminance,
	gridAlignmentScore,
	scoreAxisSignals,
} from "./grid-signals/profiles";
import {
	perceptualReconstructionError,
	reconstructionScore,
} from "./grid-signals/reconstruction";
import { cropRawImage, findOpaqueBounds } from "./image-operations";

export type PhaseAwareGridEstimate = PixelGrid & {
	outW: number;
	outH: number;
	candidates?: PhaseAwareGridEstimate[];
};

export type GridEstimateLike = {
	cellW: number;
	cellH: number;
	offsetX: number;
	offsetY: number;
	score?: number;
	scoreX?: number;
	scoreY?: number;
};

export type DeskewGridCandidate = {
	angle: number;
	confidence: number;
	alignmentScore: number;
	image: RawImage;
	mask: RawImage;
	estimate: PhaseAwareGridEstimate;
};

export type DeskewGridSearchResult = {
	angle: number;
	image: RawImage;
	mask: RawImage;
	estimate: PhaseAwareGridEstimate;
	candidates: DeskewGridCandidate[];
};

type AxisCandidate = {
	cell: number;
	phase: number;
	score: number;
	signals: AxisSignalScores;
};

const PHASE_EPSILON = 1e-6;

export const normalizeGridPhase = (value: number, cell: number): number => {
	const normalized = ((value % cell) + cell) % cell;
	return normalized < PHASE_EPSILON || cell - normalized < PHASE_EPSILON
		? 0
		: normalized;
};

export const resolveGridEstimate = (
	estimate: GridEstimateLike,
	source: Pick<RawImage, "width" | "height">,
	bboxOrigin: { x: number; y: number },
	phaseAware: boolean,
): PixelGrid => {
	const offsetX = phaseAware
		? normalizeGridPhase(bboxOrigin.x + estimate.offsetX, estimate.cellW)
		: 0;
	const offsetY = phaseAware
		? normalizeGridPhase(bboxOrigin.y + estimate.offsetY, estimate.cellH)
		: 0;
	const cropX = offsetX > PHASE_EPSILON ? offsetX - estimate.cellW : 0;
	const cropY = offsetY > PHASE_EPSILON ? offsetY - estimate.cellH : 0;
	const outW = Math.max(
		1,
		phaseAware
			? Math.ceil((source.width - cropX) / estimate.cellW)
			: Math.floor(source.width / estimate.cellW),
	);
	const outH = Math.max(
		1,
		phaseAware
			? Math.ceil((source.height - cropY) / estimate.cellH)
			: Math.floor(source.height / estimate.cellH),
	);
	return {
		cellW: estimate.cellW,
		cellH: estimate.cellH,
		offsetX,
		offsetY,
		cropX,
		cropY,
		cropW: outW * estimate.cellW,
		cropH: outH * estimate.cellH,
		outW,
		outH,
		score: estimate.score ?? 0,
		scoreX: estimate.scoreX,
		scoreY: estimate.scoreY,
	};
};

const strongestTransitions = (edges: Float64Array): number[] => {
	const positions: number[] = [];
	for (let position = 1; position < edges.length - 1; position += 1) {
		if (edges[position] <= 0) continue;
		positions.push(position);
	}
	positions.sort((left, right) => edges[right] - edges[left] || left - right);
	positions.length = Math.min(
		positions.length,
		GRID_SEARCH_LIMITS.maxTransitionSamples,
	);
	positions.sort((left, right) => left - right);
	return positions;
};

const addCellCandidate = (
	values: number[],
	seen: Set<number>,
	value: number,
	maxCell: number,
): void => {
	if (value < 1 || value > maxCell) return;
	const rounded = Math.round(value * 10000) / 10000;
	if (seen.has(rounded)) return;
	seen.add(rounded);
	values.push(rounded);
};

const createCellCandidates = (
	length: number,
	edges: Float64Array,
	maxCell: number,
): number[] => {
	const values: number[] = [];
	const seen = new Set<number>();
	const maxOutputs = Math.min(GRID_SEARCH_LIMITS.outputDimensionLimit, length);
	for (let output = 1; output <= maxOutputs; output += 1) {
		addCellCandidate(values, seen, length / output, maxCell);
	}
	for (let cell = 1; cell <= Math.floor(maxCell); cell += 1) {
		addCellCandidate(values, seen, cell, maxCell);
	}
	const transitions = strongestTransitions(edges);
	for (let left = 0; left < transitions.length; left += 1) {
		const maxRight = Math.min(transitions.length, left + 9);
		for (let right = left + 1; right < maxRight; right += 1) {
			const distance = transitions[right] - transitions[left];
			const span = right - left;
			addCellCandidate(values, seen, distance / span, maxCell);
		}
	}
	return values;
};

const createPhaseCandidates = (
	cell: number,
	transitions: number[],
): number[] => {
	const phases = [0];
	const seen = new Set<number>([0]);
	for (let index = 0; index < transitions.length; index += 1) {
		const phase =
			Math.round(normalizeGridPhase(transitions[index], cell) * 4) / 4;
		const normalized = normalizeGridPhase(phase, cell);
		const key = Math.round(normalized * 10000);
		if (seen.has(key)) continue;
		seen.add(key);
		phases.push(normalized);
	}
	return phases;
};

/**
 * 周期の繰り返し回数に応じてスコアを減衰させる係数。
 *
 * [Intended] 遷移が数本しかない画像では、セルを大きく取るほど「予測した境界がすべて
 * 遷移に一致する」状態を作れてしまい、格子整合スコアが満点になる。繰り返しの少ない
 * 周期は偶然の一致でしかないため、必要な繰り返し回数に届くまで線形に減衰させる。
 */
const periodicityConfidence = (length: number, cell: number): number => {
	if (cell <= 0) return 0;
	const periods = length / cell;
	return Math.min(1, periods / GRID_SEARCH_LIMITS.minGridPeriods);
};

const scoreAxisCandidate = (
	edges: Float64Array,
	profile: AxisSignalProfile,
	options: GridSignalOptions,
	length: number,
	cell: number,
	phase: number,
): AxisCandidate => {
	const signals = scoreAxisSignals(
		profile,
		edges,
		cell,
		phase,
		options,
		normalizeGridPhase,
	);
	const alignment =
		gridAlignmentScore(edges, cell, phase, normalizeGridPhase) * 0.75 +
		signals.autocorrelation * 0.15 +
		signals.localPhaseStability * 0.1;
	return {
		cell,
		phase,
		score: alignment * periodicityConfidence(length, cell),
		signals,
	};
};

const findAxisCandidates = (
	edges: Float64Array,
	profile: AxisSignalProfile,
	options: GridSignalOptions,
	length: number,
	maxCell: number,
): AxisCandidate[] => {
	const transitions = strongestTransitions(edges);
	const cells = createCellCandidates(length, edges, maxCell);
	const candidates: AxisCandidate[] = [];
	for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
		const cell = cells[cellIndex];
		const phases = createPhaseCandidates(cell, transitions);
		let best: AxisCandidate | null = null;
		let zeroPhase: AxisCandidate | null = null;
		for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
			const phase = phases[phaseIndex];
			const candidate = scoreAxisCandidate(
				edges,
				profile,
				options,
				length,
				cell,
				phase,
			);
			if (
				!best ||
				candidate.score > best.score ||
				(candidate.score === best.score && candidate.phase < best.phase)
			)
				best = candidate;
			if (phase === 0) zeroPhase = candidate;
		}
		if (best) candidates.push(best);
		if (zeroPhase && best?.phase !== 0) candidates.push(zeroPhase);
	}
	candidates.sort(
		(left, right) =>
			right.score - left.score ||
			right.cell - left.cell ||
			left.phase - right.phase,
	);
	const selected: AxisCandidate[] = [];
	const outputSizes = new Set<number>();
	for (let index = 0; index < candidates.length; index += 1) {
		const candidate = candidates[index];
		const cropStart =
			candidate.phase > PHASE_EPSILON ? candidate.phase - candidate.cell : 0;
		const output = Math.max(
			1,
			Math.min(
				GRID_SEARCH_LIMITS.outputDimensionLimit,
				Math.ceil((length - cropStart) / candidate.cell),
			),
		);
		if (outputSizes.has(output)) continue;
		outputSizes.add(output);
		selected.push(candidate);
		if (selected.length >= GRID_SEARCH_LIMITS.axisCandidateLimit / 2) break;
	}
	const baseCandidates = [...selected];
	for (let index = 0; index < baseCandidates.length; index += 1) {
		const cell = baseCandidates[index].cell * 2;
		if (cell > maxCell) continue;
		const phases = createPhaseCandidates(cell, transitions);
		let best: AxisCandidate | null = null;
		for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
			const phase = phases[phaseIndex];
			const candidate = scoreAxisCandidate(
				edges,
				profile,
				options,
				length,
				cell,
				phase,
			);
			if (!best || candidate.score > best.score) best = candidate;
		}
		if (best) selected.push(best);
		if (best?.phase !== 0) {
			selected.push(
				scoreAxisCandidate(edges, profile, options, length, cell, 0),
			);
		}
		if (selected.length >= GRID_SEARCH_LIMITS.axisCandidateLimit) break;
	}
	const unique: AxisCandidate[] = [];
	const seen = new Set<string>();
	for (let index = 0; index < selected.length; index += 1) {
		const candidate = selected[index];
		const key = `${candidate.cell}:${candidate.phase}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(candidate);
	}
	return unique;
};

const localCropStart = (phase: number, cell: number): number =>
	phase > PHASE_EPSILON ? phase - cell : 0;

const outputLength = (
	length: number,
	cropStart: number,
	cell: number,
): number =>
	Math.max(
		1,
		Math.min(
			GRID_SEARCH_LIMITS.outputDimensionLimit,
			Math.ceil((length - cropStart) / cell),
		),
	);

const pairScore = (
	image: RawImage,
	mask: RawImage,
	x: AxisCandidate,
	y: AxisCandidate,
	pixelStride: number,
	options: GridSignalOptions,
	knownReconstruction?: number,
): number => {
	const cropX = localCropStart(x.phase, x.cell);
	const cropY = localCropStart(y.phase, y.cell);
	const outW = outputLength(image.width, cropX, x.cell);
	const outH = outputLength(image.height, cropY, y.cell);
	const reconstruction =
		knownReconstruction ??
		(options.reconstruction
			? perceptualReconstructionError(
					image,
					mask,
					cropX,
					cropY,
					x.cell,
					y.cell,
					pixelStride,
				)
			: 0);
	return (
		reconstruction * 255 + 2 * Math.sqrt(outW * outH) - (x.score + y.score) * 12
	);
};

const meanAxisSignal = (
	x: AxisCandidate,
	y: AxisCandidate,
	key: keyof AxisSignalScores,
): number => (x.signals[key] + y.signals[key]) / 2;

const toEstimate = (
	image: RawImage,
	x: AxisCandidate,
	y: AxisCandidate,
	score: number,
	reconstruction: number,
	options: GridSignalOptions,
): PhaseAwareGridEstimate => {
	const cropX = localCropStart(x.phase, x.cell);
	const cropY = localCropStart(y.phase, y.cell);
	const outW = outputLength(image.width, cropX, x.cell);
	const outH = outputLength(image.height, cropY, y.cell);
	const signalScores: GridSignalScores = {
		colorBoundary: meanAxisSignal(x, y, "colorBoundary"),
		luminanceGradient: meanAxisSignal(x, y, "luminanceGradient"),
		alphaGradient: meanAxisSignal(x, y, "alphaGradient"),
		autocorrelation: meanAxisSignal(x, y, "autocorrelation"),
		reconstruction: options.reconstruction
			? reconstructionScore(reconstruction)
			: 0,
		localPhaseStability: meanAxisSignal(x, y, "localPhaseStability"),
		methodAgreement: meanAxisSignal(x, y, "methodAgreement"),
	};
	return {
		cellW: x.cell,
		cellH: y.cell,
		offsetX: x.phase,
		offsetY: y.phase,
		cropX,
		cropY,
		cropW: outW * x.cell,
		cropH: outH * y.cell,
		outW,
		outH,
		score,
		scoreX: x.score,
		scoreY: y.score,
		signalScores,
	};
};

export const searchPhaseAwareGrid = (
	image: RawImage,
	mask: RawImage,
	signalOptions: Partial<GridSignalOptions> = {},
): PhaseAwareGridEstimate | null => {
	if (image.width === 0 || image.height === 0) return null;
	const options: GridSignalOptions = {
		...GRID_SIGNAL_DEFAULTS,
		...signalOptions,
	};
	const orthogonalStride = Math.max(
		1,
		Math.ceil(
			Math.max(image.width, image.height) /
				GRID_SEARCH_LIMITS.maxAnalysisDimension,
		),
	);
	const maxCell = Math.max(1, Math.min(image.width, image.height));
	const luminance = createLinearLuminance(image);
	const xProfile = createAxisSignalProfile(
		image,
		mask,
		"x",
		orthogonalStride,
		luminance,
	);
	const yProfile = createAxisSignalProfile(
		image,
		mask,
		"y",
		orthogonalStride,
		luminance,
	);
	const xEdges = combineSignalProfiles(xProfile, options);
	const yEdges = combineSignalProfiles(yProfile, options);
	const xCandidates = findAxisCandidates(
		xEdges,
		xProfile,
		options,
		image.width,
		maxCell,
	);
	const yCandidates = findAxisCandidates(
		yEdges,
		yProfile,
		options,
		image.height,
		maxCell,
	);
	if (xCandidates.length === 0 || yCandidates.length === 0) return null;

	const pairs: Array<{
		x: AxisCandidate;
		y: AxisCandidate;
		score: number;
		reconstruction: number;
		harmonicPenalty: boolean;
	}> = [];
	for (let yIndex = 0; yIndex < yCandidates.length; yIndex += 1) {
		for (let xIndex = 0; xIndex < xCandidates.length; xIndex += 1) {
			const x = xCandidates[xIndex];
			const y = yCandidates[yIndex];
			pairs.push({
				x,
				y,
				score: x.score + y.score,
				reconstruction: 0,
				harmonicPenalty: false,
			});
		}
	}
	pairs.sort(
		(left, right) =>
			right.score - left.score ||
			right.x.cell * right.y.cell - left.x.cell * left.y.cell ||
			left.x.phase - right.x.phase ||
			left.y.phase - right.y.phase,
	);

	const coarseStride = Math.max(1, orthogonalStride * 2);
	for (let index = 0; index < pairs.length; index += 1) {
		const pair = pairs[index];
		pair.reconstruction = options.reconstruction
			? perceptualReconstructionError(
					image,
					mask,
					localCropStart(pair.x.phase, pair.x.cell),
					localCropStart(pair.y.phase, pair.y.cell),
					pair.x.cell,
					pair.y.cell,
					coarseStride,
				)
			: 0;
		pair.score = pairScore(
			image,
			mask,
			pair.x,
			pair.y,
			coarseStride,
			options,
			pair.reconstruction,
		);
	}
	applyHarmonicPenalties(pairs);
	pairs.sort(
		(left, right) =>
			left.score - right.score ||
			right.x.cell * right.y.cell - left.x.cell * left.y.cell ||
			left.x.phase - right.x.phase ||
			left.y.phase - right.y.phase,
	);
	pairs.length = Math.min(pairs.length, GRID_SEARCH_LIMITS.pairCandidateLimit);
	pairs.length = Math.min(
		pairs.length,
		GRID_SEARCH_LIMITS.fullResolutionCandidateLimit,
	);
	const fullResolutionStride = Math.max(
		1,
		Math.ceil(
			Math.sqrt(
				(image.width * image.height) /
					GRID_SEARCH_LIMITS.fullResolutionSampleLimit,
			),
		),
	);
	for (let index = 0; index < pairs.length; index += 1) {
		const pair = pairs[index];
		pair.reconstruction = options.reconstruction
			? perceptualReconstructionError(
					image,
					mask,
					localCropStart(pair.x.phase, pair.x.cell),
					localCropStart(pair.y.phase, pair.y.cell),
					pair.x.cell,
					pair.y.cell,
					fullResolutionStride,
				)
			: 0;
		pair.score = pairScore(
			image,
			mask,
			pair.x,
			pair.y,
			fullResolutionStride,
			options,
			pair.reconstruction,
		);
	}
	applyHarmonicPenalties(pairs);
	pairs.sort(
		(left, right) =>
			left.score - right.score ||
			right.x.cell * right.y.cell - left.x.cell * left.y.cell ||
			left.x.phase - right.x.phase ||
			left.y.phase - right.y.phase,
	);
	const estimates = pairs.map((pair) =>
		toEstimate(image, pair.x, pair.y, pair.score, pair.reconstruction, options),
	);
	if (estimates.length === 0) return null;
	return { ...estimates[0], candidates: estimates.slice(1) };
};

const deskewConfidence = (estimate: PhaseAwareGridEstimate): number =>
	Math.min(estimate.scoreX ?? 0, estimate.scoreY ?? 0);

const compareDeskewCandidates = (
	left: Pick<
		DeskewGridCandidate,
		"angle" | "confidence" | "alignmentScore" | "estimate"
	>,
	right: Pick<
		DeskewGridCandidate,
		"angle" | "confidence" | "alignmentScore" | "estimate"
	>,
): number =>
	right.alignmentScore - left.alignmentScore ||
	right.confidence - left.confidence ||
	left.estimate.score - right.estimate.score ||
	Math.abs(left.angle) - Math.abs(right.angle) ||
	left.angle - right.angle;

export const hasMeaningfulDeskewScoreGain = (
	bestScore: number,
	zeroScore: number,
): boolean =>
	bestScore - zeroScore >=
	Math.max(1e-9, 1 - zeroScore) * DESKEW_LIMITS.minimumScoreHeadroomGain;

const compareDeskewAngles = (
	left: Pick<DeskewGridCandidate, "angle" | "alignmentScore">,
	right: Pick<DeskewGridCandidate, "angle" | "alignmentScore">,
): number =>
	right.alignmentScore - left.alignmentScore ||
	Math.abs(left.angle) - Math.abs(right.angle) ||
	left.angle - right.angle;

export const searchDeskewedGrid = (
	image: RawImage,
	mask: RawImage,
	signalOptions: Partial<GridSignalOptions> = {},
): DeskewGridSearchResult | null => {
	if (image.width === 0 || image.height === 0) return null;
	const analysisImage = createDeskewAnalysisImage(image);
	const coarse: Array<{
		angle: number;
		alignmentScore: number;
	}> = [];
	const angles = createDeskewAngles();
	const alignmentScores = scoreDeskewAngles(analysisImage, angles);
	for (let index = 0; index < angles.length; index += 1) {
		const angle = angles[index];
		coarse.push({
			angle,
			alignmentScore: alignmentScores[index],
		});
	}
	if (coarse.length === 0) return null;
	coarse.sort(compareDeskewAngles);
	const coarseAlignmentRange = Math.max(
		coarse[0].alignmentScore - coarse[coarse.length - 1].alignmentScore,
		1e-9,
	);
	const zeroIndex = coarse.findIndex((candidate) => candidate.angle === 0);
	const zeroCoarse = zeroIndex >= 0 ? coarse[zeroIndex] : undefined;
	const coarseGain = zeroCoarse
		? (coarse[0].alignmentScore - zeroCoarse.alignmentScore) /
			coarseAlignmentRange
		: 1;
	if (coarse[0].angle === 0) return null;
	if (coarseGain < DESKEW_LIMITS.minimumConfidenceGain) return null;
	if (
		zeroCoarse &&
		!hasMeaningfulDeskewScoreGain(
			coarse[0].alignmentScore,
			zeroCoarse.alignmentScore,
		)
	)
		return null;
	const selectedCoarse = coarse.slice(
		0,
		DESKEW_LIMITS.fullResolutionCandidateLimit,
	);
	if (
		zeroIndex >= 0 &&
		!selectedCoarse.some((candidate) => candidate.angle === 0)
	) {
		selectedCoarse[selectedCoarse.length - 1] = coarse[zeroIndex];
	}

	const full: DeskewGridCandidate[] = [];
	for (let index = 0; index < selectedCoarse.length; index += 1) {
		const coarseCandidate = selectedCoarse[index];
		const rotatedImage = rotateRawImageExpanded(image, coarseCandidate.angle);
		// [Intended] 同じ画像をマスクとして使う通常経路では、フル解像度の回転結果を共有する。
		const rotatedMask =
			mask === image
				? rotatedImage
				: rotateRawImageExpanded(mask, coarseCandidate.angle);
		const bounds = findOpaqueBounds(rotatedMask, 16);
		const searchImage = bounds
			? cropRawImage(rotatedImage, bounds.x, bounds.y, bounds.w, bounds.h)
			: rotatedImage;
		const searchMask = bounds
			? cropRawImage(rotatedMask, bounds.x, bounds.y, bounds.w, bounds.h)
			: rotatedMask;
		const localEstimate = searchPhaseAwareGrid(
			searchImage,
			searchMask,
			signalOptions,
		);
		const estimate = localEstimate
			? ({
					...resolveGridEstimate(
						localEstimate,
						rotatedImage,
						bounds ?? { x: 0, y: 0 },
						true,
					),
					candidates: localEstimate.candidates,
				} as PhaseAwareGridEstimate)
			: null;
		if (!estimate) continue;
		estimate.angle = coarseCandidate.angle;
		full.push({
			angle: coarseCandidate.angle,
			confidence: deskewConfidence(estimate),
			alignmentScore: coarseCandidate.alignmentScore,
			image: rotatedImage,
			mask: rotatedMask,
			estimate,
		});
	}
	if (full.length === 0) return null;
	full.sort(compareDeskewCandidates);
	const zero = full.find((candidate) => candidate.angle === 0);
	const best = full[0];
	const alignmentGain = zero
		? (best.alignmentScore - zero.alignmentScore) / coarseAlignmentRange
		: 1;
	const canApply =
		best.angle !== 0 &&
		best.confidence >= DESKEW_LIMITS.minimumConfidence &&
		alignmentGain >= DESKEW_LIMITS.minimumConfidenceGain;
	const selected = canApply ? best : zero;
	// [Policy] 信頼度を満たさない非ゼロ候補は、自動補正として適用しない。
	if (!selected) return null;
	return {
		angle: selected.angle,
		image: selected.image,
		mask: selected.mask,
		estimate: selected.estimate,
		candidates: full,
	};
};
