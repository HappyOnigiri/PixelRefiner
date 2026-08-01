import { describe, expect, it } from "vitest";
import type { PixelGrid, RawImage } from "../../src/shared/types";
import {
	backgroundMaskIou,
	createDiffImage,
	edgeF1,
	isCatastrophicFailure,
	meanRgbaError,
	smallComponentRetention,
	topGridCandidates,
} from "./metrics";

const image = (width: number, height: number, pixels: number[]): RawImage => ({
	width,
	height,
	data: new Uint8ClampedArray(pixels),
});

const grid = (outW: number, outH: number, score: number): PixelGrid => ({
	cellW: 1,
	cellH: 1,
	offsetX: 0,
	offsetY: 0,
	outW,
	outH,
	score,
});

describe("quality metrics", () => {
	it("normalizes invisible RGB values when calculating RGBA error", () => {
		const transparentBlack = image(1, 1, [0, 0, 0, 0]);
		const transparentWhite = image(1, 1, [255, 255, 255, 0]);
		expect(meanRgbaError(transparentBlack, transparentWhite)).toBe(0);
	});

	it("calculates edge and background-mask agreement", () => {
		const expected = image(2, 1, [0, 0, 0, 255, 0, 0, 0, 0]);
		const inverted = image(2, 1, [0, 0, 0, 0, 0, 0, 0, 255]);
		expect(edgeF1(expected, expected)).toBe(1);
		expect(backgroundMaskIou(expected, expected)).toBe(1);
		expect(backgroundMaskIou(inverted, expected)).toBe(0);
	});

	it("retains small components only when their expected positions overlap", () => {
		const expected = image(3, 1, [0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
		const moved = image(3, 1, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255]);
		expect(smallComponentRetention(expected, expected)).toBe(1);
		expect(smallComponentRetention(moved, expected)).toBe(0);
	});

	it("detects catastrophic dimensions, areas, and opacity loss", () => {
		const expected = image(2, 2, Array(4).fill([0, 0, 0, 255]).flat());
		const empty = image(2, 2, Array(4).fill([0, 0, 0, 0]).flat());
		expect(
			isCatastrophicFailure(
				image(1, 2, [0, 0, 0, 255, 0, 0, 0, 255]),
				expected,
				expected,
			),
		).toBe(true);
		expect(isCatastrophicFailure(empty, expected, expected)).toBe(true);
		expect(isCatastrophicFailure(expected, expected, expected)).toBe(false);
	});

	it("renders alpha differences and ignores invisible RGB differences", () => {
		const transparentBlack = image(1, 1, [0, 0, 0, 0]);
		const transparentWhite = image(1, 1, [255, 255, 255, 0]);
		const opaqueBlack = image(1, 1, [0, 0, 0, 255]);
		expect([
			...createDiffImage(transparentBlack, transparentWhite).data,
		]).toEqual([0, 0, 0, 255]);
		expect([...createDiffImage(opaqueBlack, transparentBlack).data]).toEqual([
			255, 255, 255, 255,
		]);
	});

	it("selects three unique grid sizes in score order", () => {
		const best = grid(8, 8, 0.1);
		best.candidates = [
			grid(4, 4, 0.4),
			grid(8, 8, 0.1),
			grid(16, 16, 0.2),
			grid(12, 12, 0.3),
		];
		expect(
			topGridCandidates(best).map(({ outW, outH }) => [outW, outH]),
		).toEqual([
			[8, 8],
			[16, 16],
			[12, 12],
		]);
	});
});
