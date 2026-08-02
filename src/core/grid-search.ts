import { GRID_SEARCH_LIMITS } from "../shared/config";
import type { Axis, PixelGrid, RawImage } from "../shared/types";

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

type AxisCandidate = {
	cell: number;
	phase: number;
	score: number;
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

const axisLength = (image: RawImage, axis: Axis): number =>
	axis === "x" ? image.width : image.height;

const createEdgeProfile = (
	image: RawImage,
	mask: RawImage,
	axis: Axis,
	orthogonalStride: number,
): Float64Array => {
	const length = axisLength(image, axis);
	const orthogonalLength = axis === "x" ? image.height : image.width;
	const edges = new Float64Array(length + 1);
	const data = image.data;
	const maskData = mask.data;
	for (let position = 1; position < length; position += 1) {
		let difference = 0;
		let samples = 0;
		for (
			let orthogonal = 0;
			orthogonal < orthogonalLength;
			orthogonal += orthogonalStride
		) {
			const beforePixel =
				axis === "x"
					? orthogonal * image.width + position - 1
					: (position - 1) * image.width + orthogonal;
			const afterPixel = beforePixel + (axis === "x" ? 1 : image.width);
			if (
				maskData[beforePixel * 4 + 3] < 16 &&
				maskData[afterPixel * 4 + 3] < 16
			)
				continue;
			const before = beforePixel * 4;
			const after = afterPixel * 4;
			difference +=
				Math.abs(data[before] - data[after]) +
				Math.abs(data[before + 1] - data[after + 1]) +
				Math.abs(data[before + 2] - data[after + 2]) +
				Math.abs(data[before + 3] - data[after + 3]);
			samples += 1;
		}
		edges[position] = samples === 0 ? 0 : difference / (samples * 4 * 255);
	}
	return edges;
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

const edgeAt = (edges: Float64Array, position: number): number => {
	const center = Math.round(position);
	let value = 0;
	for (let delta = -1; delta <= 1; delta += 1) {
		const index = center + delta;
		if (index > 0 && index < edges.length - 1) {
			const distance = Math.abs(position - index);
			value = Math.max(value, edges[index] * Math.max(0, 1 - distance));
		}
	}
	return value;
};

const scoreAxisCandidate = (
	edges: Float64Array,
	cell: number,
	phase: number,
): number => {
	let totalEdge = 0;
	let alignedEdge = 0;
	let maxEdge = 0;
	for (let position = 1; position < edges.length - 1; position += 1) {
		const edge = edges[position];
		totalEdge += edge;
		maxEdge = Math.max(maxEdge, edge);
		const remainder = normalizeGridPhase(position - phase, cell);
		const distance = Math.min(remainder, cell - remainder);
		// [Intended] 最近傍スケーリングでは分数境界が隣接するいずれかの元ピクセル上に置かれるため、
		// 半ピクセルまでのサブピクセルオフセットは完全に一致する。
		if (distance <= 0.625) alignedEdge += edge;
	}
	let predictedEvidence = 0;
	let predictedCount = 0;
	for (
		let boundary = phase === 0 ? cell : phase;
		boundary < edges.length - 1;
		boundary += cell
	) {
		predictedEvidence += edgeAt(edges, boundary);
		predictedCount += 1;
	}
	const recall = totalEdge === 0 ? 0 : alignedEdge / totalEdge;
	const precision =
		predictedCount === 0 || maxEdge === 0
			? 0
			: predictedEvidence / (predictedCount * maxEdge);
	const complexity = Math.min(1, Math.log2(Math.max(1, cell)) / 6);
	return recall * 0.62 + precision * 0.33 + complexity * 0.05;
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

const findAxisCandidates = (
	edges: Float64Array,
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
			const candidate = {
				cell,
				phase,
				score: scoreAxisCandidate(edges, cell, phase),
			};
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
			const candidate = {
				cell,
				phase,
				score: scoreAxisCandidate(edges, cell, phase),
			};
			if (!best || candidate.score > best.score) best = candidate;
		}
		if (best) selected.push(best);
		if (best?.phase !== 0) {
			selected.push({
				cell,
				phase: 0,
				score: scoreAxisCandidate(edges, cell, 0),
			});
		}
		if (selected.length >= GRID_SEARCH_LIMITS.axisCandidateLimit) break;
	}
	return selected;
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

const reconstructionError = (
	image: RawImage,
	mask: RawImage,
	x: AxisCandidate,
	y: AxisCandidate,
	pixelStride: number,
): number => {
	const cropX = localCropStart(x.phase, x.cell);
	const cropY = localCropStart(y.phase, y.cell);
	const data = image.data;
	const maskData = mask.data;
	let error = 0;
	let samples = 0;
	for (let sourceY = 0; sourceY < image.height; sourceY += pixelStride) {
		const cellY = Math.floor((sourceY - cropY) / y.cell);
		const centerY = Math.min(
			image.height - 1,
			Math.max(0, Math.floor(cropY + (cellY + 0.5) * y.cell)),
		);
		for (let sourceX = 0; sourceX < image.width; sourceX += pixelStride) {
			const pixel = sourceY * image.width + sourceX;
			if (maskData[pixel * 4 + 3] < 16) continue;
			const cellX = Math.floor((sourceX - cropX) / x.cell);
			const centerX = Math.min(
				image.width - 1,
				Math.max(0, Math.floor(cropX + (cellX + 0.5) * x.cell)),
			);
			const source = pixel * 4;
			const center = (centerY * image.width + centerX) * 4;
			error +=
				Math.abs(data[source] - data[center]) +
				Math.abs(data[source + 1] - data[center + 1]) +
				Math.abs(data[source + 2] - data[center + 2]) +
				Math.abs(data[source + 3] - data[center + 3]);
			samples += 1;
		}
	}
	return samples === 0 ? Number.POSITIVE_INFINITY : error / (samples * 4);
};

const pairScore = (
	image: RawImage,
	mask: RawImage,
	x: AxisCandidate,
	y: AxisCandidate,
	pixelStride: number,
): number => {
	const outW = outputLength(
		image.width,
		localCropStart(x.phase, x.cell),
		x.cell,
	);
	const outH = outputLength(
		image.height,
		localCropStart(y.phase, y.cell),
		y.cell,
	);
	return (
		reconstructionError(image, mask, x, y, pixelStride) +
		2 * Math.sqrt(outW * outH) -
		(x.score + y.score) * 8
	);
};

const toEstimate = (
	image: RawImage,
	x: AxisCandidate,
	y: AxisCandidate,
	score: number,
): PhaseAwareGridEstimate => {
	const cropX = localCropStart(x.phase, x.cell);
	const cropY = localCropStart(y.phase, y.cell);
	const outW = outputLength(image.width, cropX, x.cell);
	const outH = outputLength(image.height, cropY, y.cell);
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
	};
};

export const searchPhaseAwareGrid = (
	image: RawImage,
	mask: RawImage,
): PhaseAwareGridEstimate | null => {
	if (image.width === 0 || image.height === 0) return null;
	const orthogonalStride = Math.max(
		1,
		Math.ceil(
			Math.max(image.width, image.height) /
				GRID_SEARCH_LIMITS.maxAnalysisDimension,
		),
	);
	const maxCell = Math.max(1, Math.min(image.width, image.height));
	const xEdges = createEdgeProfile(image, mask, "x", orthogonalStride);
	const yEdges = createEdgeProfile(image, mask, "y", orthogonalStride);
	const xCandidates = findAxisCandidates(xEdges, image.width, maxCell);
	const yCandidates = findAxisCandidates(yEdges, image.height, maxCell);
	if (xCandidates.length === 0 || yCandidates.length === 0) return null;

	const pairs: Array<{ x: AxisCandidate; y: AxisCandidate; score: number }> =
		[];
	for (let yIndex = 0; yIndex < yCandidates.length; yIndex += 1) {
		for (let xIndex = 0; xIndex < xCandidates.length; xIndex += 1) {
			const x = xCandidates[xIndex];
			const y = yCandidates[yIndex];
			pairs.push({ x, y, score: x.score + y.score });
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
		pair.score = pairScore(image, mask, pair.x, pair.y, coarseStride);
	}
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
	for (let index = 0; index < pairs.length; index += 1) {
		const pair = pairs[index];
		pair.score = pairScore(image, mask, pair.x, pair.y, 1);
	}
	pairs.sort(
		(left, right) =>
			left.score - right.score ||
			right.x.cell * right.y.cell - left.x.cell * left.y.cell ||
			left.x.phase - right.x.phase ||
			left.y.phase - right.y.phase,
	);
	const estimates = pairs.map((pair) =>
		toEstimate(image, pair.x, pair.y, pair.score),
	);
	if (estimates.length === 0) return null;
	return { ...estimates[0], candidates: estimates.slice(1) };
};
