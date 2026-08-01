import type { PixelGrid, RawImage } from "../../src/shared/types";
import { imagesEqual } from "./image";
import type { QualityMetrics } from "./types";

const isOpaque = (image: RawImage, pixelIndex: number): boolean =>
	image.data[pixelIndex * 4 + 3] >= 16;

const comparableIndex = (
	image: RawImage,
	reference: RawImage,
	x: number,
	y: number,
): number => {
	const sourceX = Math.min(
		image.width - 1,
		Math.floor(((x + 0.5) * image.width) / reference.width),
	);
	const sourceY = Math.min(
		image.height - 1,
		Math.floor(((y + 0.5) * image.height) / reference.height),
	);
	return (sourceY * image.width + sourceX) * 4;
};

export const meanRgbaError = (actual: RawImage, expected: RawImage): number => {
	let total = 0;
	const channelCount = expected.width * expected.height * 4;
	for (let y = 0; y < expected.height; y += 1) {
		for (let x = 0; x < expected.width; x += 1) {
			const actualIndex = comparableIndex(actual, expected, x, y);
			const expectedIndex = (y * expected.width + x) * 4;
			for (let channel = 0; channel < 4; channel += 1) {
				const actualValue =
					channel < 3 && actual.data[actualIndex + 3] === 0
						? 0
						: actual.data[actualIndex + channel];
				const expectedValue =
					channel < 3 && expected.data[expectedIndex + 3] === 0
						? 0
						: expected.data[expectedIndex + channel];
				total += Math.abs(actualValue - expectedValue);
			}
		}
	}
	return channelCount === 0 ? 0 : total / channelCount;
};

const buildEdgeMask = (image: RawImage): Uint8Array => {
	const mask = new Uint8Array(image.width * image.height);
	for (let y = 0; y < image.height; y += 1) {
		for (let x = 0; x < image.width; x += 1) {
			const pixel = y * image.width + x;
			const opaque = isOpaque(image, pixel);
			const right = x + 1 < image.width && isOpaque(image, pixel + 1);
			const down = y + 1 < image.height && isOpaque(image, pixel + image.width);
			if (
				(x + 1 < image.width && opaque !== right) ||
				(y + 1 < image.height && opaque !== down)
			) {
				mask[pixel] = 1;
			}
		}
	}
	return mask;
};

export const edgeF1 = (actual: RawImage, expected: RawImage): number => {
	if (actual.width !== expected.width || actual.height !== expected.height)
		return 0;
	const actualEdges = buildEdgeMask(actual);
	const expectedEdges = buildEdgeMask(expected);
	let truePositive = 0;
	let falsePositive = 0;
	let falseNegative = 0;
	for (let i = 0; i < actualEdges.length; i += 1) {
		if (actualEdges[i] && expectedEdges[i]) truePositive += 1;
		else if (actualEdges[i]) falsePositive += 1;
		else if (expectedEdges[i]) falseNegative += 1;
	}
	if (truePositive === 0 && falsePositive === 0 && falseNegative === 0)
		return 1;
	return (
		(2 * truePositive) / (2 * truePositive + falsePositive + falseNegative)
	);
};

export const backgroundMaskIou = (
	actual: RawImage,
	expected: RawImage,
): number => {
	if (actual.width !== expected.width || actual.height !== expected.height)
		return 0;
	let intersection = 0;
	let union = 0;
	const pixels = actual.width * actual.height;
	for (let i = 0; i < pixels; i += 1) {
		const actualBackground = !isOpaque(actual, i);
		const expectedBackground = !isOpaque(expected, i);
		if (actualBackground && expectedBackground) intersection += 1;
		if (actualBackground || expectedBackground) union += 1;
	}
	return union === 0 ? 1 : intersection / union;
};

const smallComponentMatches = (
	actual: RawImage,
	expected: RawImage,
): { expected: number; retained: number } => {
	const visited = new Uint8Array(expected.width * expected.height);
	const queue = new Int32Array(expected.width * expected.height);
	let expectedCount = 0;
	let retainedCount = 0;
	for (let start = 0; start < visited.length; start += 1) {
		if (visited[start] || !isOpaque(expected, start)) continue;
		let read = 0;
		let write = 1;
		let size = 0;
		let overlapsActual = false;
		queue[0] = start;
		visited[start] = 1;
		while (read < write) {
			const current = queue[read];
			read += 1;
			size += 1;
			if (isOpaque(actual, current)) overlapsActual = true;
			const x = current % expected.width;
			const y = Math.floor(current / expected.width);
			if (x > 0) {
				const next = current - 1;
				if (!visited[next] && isOpaque(expected, next)) {
					visited[next] = 1;
					queue[write] = next;
					write += 1;
				}
			}
			if (x + 1 < expected.width) {
				const next = current + 1;
				if (!visited[next] && isOpaque(expected, next)) {
					visited[next] = 1;
					queue[write] = next;
					write += 1;
				}
			}
			if (y > 0) {
				const next = current - expected.width;
				if (!visited[next] && isOpaque(expected, next)) {
					visited[next] = 1;
					queue[write] = next;
					write += 1;
				}
			}
			if (y + 1 < expected.height) {
				const next = current + expected.width;
				if (!visited[next] && isOpaque(expected, next)) {
					visited[next] = 1;
					queue[write] = next;
					write += 1;
				}
			}
		}
		if (size <= 3) {
			expectedCount += 1;
			if (overlapsActual) retainedCount += 1;
		}
	}
	return { expected: expectedCount, retained: retainedCount };
};

export const smallComponentRetention = (
	actual: RawImage,
	expected: RawImage,
): number => {
	if (actual.width !== expected.width || actual.height !== expected.height)
		return 0;
	const matches = smallComponentMatches(actual, expected);
	return matches.expected === 0 ? 1 : matches.retained / matches.expected;
};

export const topGridCandidates = (grid: PixelGrid): PixelGrid[] => {
	const candidates = [grid, ...(grid.candidates ?? [])].sort(
		(left, right) => left.score - right.score,
	);
	const selected: PixelGrid[] = [];
	const seenSizes = new Set<string>();
	for (const candidate of candidates) {
		const size = `${String(candidate.outW)}x${String(candidate.outH)}`;
		if (seenSizes.has(size)) continue;
		seenSizes.add(size);
		selected.push(candidate);
		if (selected.length === 3) break;
	}
	return selected;
};

export const isCatastrophicFailure = (
	actual: RawImage,
	input: RawImage,
	expected: RawImage,
): boolean => {
	if (actual.width <= 1 || actual.height <= 1) return true;
	const expectedArea = expected.width * expected.height;
	const actualArea = actual.width * actual.height;
	if (
		actualArea < expectedArea / 16 ||
		actualArea > input.width * input.height * 4
	) {
		return true;
	}
	let actualOpaque = 0;
	let expectedOpaque = 0;
	for (let i = 0; i < actual.width * actual.height; i += 1) {
		if (isOpaque(actual, i)) actualOpaque += 1;
	}
	for (let i = 0; i < expected.width * expected.height; i += 1) {
		if (isOpaque(expected, i)) expectedOpaque += 1;
	}
	return expectedOpaque > 0 && actualOpaque < expectedOpaque * 0.2;
};

export const calculateMetrics = (
	actual: RawImage,
	input: RawImage,
	expected: RawImage,
	grid: PixelGrid,
	repeat: RawImage,
	runtimeMs: number,
): QualityMetrics => {
	const top3SizeCorrect = topGridCandidates(grid).some(
		(candidate) =>
			candidate.outW === expected.width && candidate.outH === expected.height,
	);
	return {
		outputWidth: actual.width,
		outputHeight: actual.height,
		sizeCorrect:
			actual.width === expected.width && actual.height === expected.height,
		top3SizeCorrect,
		gridPhaseError: Math.abs(grid.offsetX) + Math.abs(grid.offsetY),
		meanRgbaError: meanRgbaError(actual, expected),
		edgeF1: edgeF1(actual, expected),
		backgroundMaskIou: backgroundMaskIou(actual, expected),
		smallComponentRetention: smallComponentRetention(actual, expected),
		byteIdentical: imagesEqual(actual, repeat),
		catastrophicFailure: isCatastrophicFailure(actual, input, expected),
		runtimeMs,
		approxPeakBytes:
			input.data.byteLength + actual.data.byteLength + repeat.data.byteLength,
	};
};

export const createDiffImage = (
	actual: RawImage,
	expected: RawImage,
): RawImage => {
	const width = Math.max(actual.width, expected.width);
	const height = Math.max(actual.height, expected.height);
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const outputIndex = (y * width + x) * 4;
			const actualIndex =
				x < actual.width && y < actual.height ? (y * actual.width + x) * 4 : -1;
			const expectedIndex =
				x < expected.width && y < expected.height
					? (y * expected.width + x) * 4
					: -1;
			const actualAlpha = actualIndex < 0 ? 0 : actual.data[actualIndex + 3];
			const expectedAlpha =
				expectedIndex < 0 ? 0 : expected.data[expectedIndex + 3];
			const alphaDifference = Math.abs(actualAlpha - expectedAlpha);
			for (let channel = 0; channel < 3; channel += 1) {
				const actualValue =
					actualIndex < 0 || actualAlpha === 0
						? 0
						: actual.data[actualIndex + channel];
				const expectedValue =
					expectedIndex < 0 || expectedAlpha === 0
						? 0
						: expected.data[expectedIndex + channel];
				// [Intended] Encode alpha differences as visible intensity while keeping the PNG opaque.
				data[outputIndex + channel] = Math.max(
					Math.abs(actualValue - expectedValue),
					alphaDifference,
				);
			}
			data[outputIndex + 3] = 255;
		}
	}
	return { width, height, data };
};

export const createBackgroundMaskImage = (image: RawImage): RawImage => {
	const data = new Uint8ClampedArray(image.width * image.height * 4);
	for (let i = 0; i < image.width * image.height; i += 1) {
		const outputIndex = i * 4;
		const value = isOpaque(image, i) ? 0 : 255;
		data[outputIndex] = value;
		data[outputIndex + 1] = value;
		data[outputIndex + 2] = value;
		data[outputIndex + 3] = 255;
	}
	return { width: image.width, height: image.height, data };
};
