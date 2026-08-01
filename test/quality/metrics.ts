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
				total += Math.abs(
					actual.data[actualIndex + channel] -
						expected.data[expectedIndex + channel],
				);
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

const componentSizes = (image: RawImage): number[] => {
	const visited = new Uint8Array(image.width * image.height);
	const queue = new Int32Array(image.width * image.height);
	const sizes: number[] = [];
	for (let start = 0; start < visited.length; start += 1) {
		if (visited[start] || !isOpaque(image, start)) continue;
		let read = 0;
		let write = 1;
		let size = 0;
		queue[0] = start;
		visited[start] = 1;
		while (read < write) {
			const current = queue[read];
			read += 1;
			size += 1;
			const x = current % image.width;
			const y = Math.floor(current / image.width);
			const neighbors = [
				x > 0 ? current - 1 : -1,
				x + 1 < image.width ? current + 1 : -1,
				y > 0 ? current - image.width : -1,
				y + 1 < image.height ? current + image.width : -1,
			];
			for (let i = 0; i < neighbors.length; i += 1) {
				const next = neighbors[i];
				if (next < 0 || visited[next] || !isOpaque(image, next)) continue;
				visited[next] = 1;
				queue[write] = next;
				write += 1;
			}
		}
		sizes.push(size);
	}
	return sizes;
};

export const smallComponentRetention = (
	actual: RawImage,
	expected: RawImage,
): number => {
	const expectedSmall = componentSizes(expected).filter(
		(size) => size <= 3,
	).length;
	if (expectedSmall === 0) return 1;
	const actualSmall = componentSizes(actual).filter((size) => size <= 3).length;
	return Math.min(1, actualSmall / expectedSmall);
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
	const candidates = [grid, ...(grid.candidates ?? [])];
	const top3SizeCorrect = candidates
		.slice(0, 3)
		.some(
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
			for (let channel = 0; channel < 4; channel += 1) {
				const actualValue =
					x < actual.width && y < actual.height
						? actual.data[(y * actual.width + x) * 4 + channel]
						: 0;
				const expectedValue =
					x < expected.width && y < expected.height
						? expected.data[(y * expected.width + x) * 4 + channel]
						: 0;
				data[outputIndex + channel] = Math.abs(actualValue - expectedValue);
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
