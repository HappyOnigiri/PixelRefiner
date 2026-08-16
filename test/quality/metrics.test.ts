import { describe, expect, it } from "vitest";
import type { PixelGrid, RawImage } from "../../src/shared/types";
import {
	backgroundMaskIou,
	calculateTargetMetrics,
	createDiffImage,
	edgeF1,
	isCatastrophicFailure,
	meanRgbaError,
	smallComponentRetention,
	targetQualityFailures,
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
		const best = grid(8, 8, 0.5);
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

	it("reports an exact match against the target", () => {
		const target = image(2, 1, [10, 20, 30, 255, 0, 0, 0, 0]);
		const actual = image(2, 1, [10, 20, 30, 255, 99, 99, 99, 0]);
		const metrics = calculateTargetMetrics(actual, target);
		expect(metrics).toMatchObject({
			targetWidth: 2,
			targetHeight: 1,
			sizeMatches: true,
			// 透明画素の RGB 差は見た目に出ないので一致として扱う。
			exactMatch: true,
			meanRgbaError: 0,
		});
	});

	// [Intended] 目標と寸法が違うケースは意図的なトリムや変換縮小でも起きる。
	// 対応づけできない指標が 0 に落ちても、サイズ不一致として読めることを保証する。
	it("keeps the size mismatch visible when the target has another size", () => {
		const target = image(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]);
		const actual = image(1, 1, [0, 0, 0, 255]);
		const metrics = calculateTargetMetrics(actual, target);
		expect(metrics.sizeMatches).toBe(false);
		expect(metrics.exactMatch).toBe(false);
		expect(metrics.edgeF1).toBe(0);
		expect(metrics.backgroundMaskIou).toBe(0);
		expect(metrics.smallComponentRetention).toBe(0);
		expect(metrics.meanRgbaError).toBe(0);
	});

	it("judges target quality with the target case allowances", () => {
		const target = image(2, 1, [0, 0, 0, 255, 0, 0, 0, 0]);
		const actual = image(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]);
		const metrics = calculateTargetMetrics(actual, target);
		expect(
			targetQualityFailures(
				metrics,
				{
					maxMeanRgbaError: 100,
					minEdgeF1: 0.8,
					minBackgroundMaskIou: 0.8,
					minSmallComponentRetention: 1,
					expectedWidth: 2,
					expectedHeight: 1,
				},
				2,
				1,
				true,
			),
		).toEqual(["edge-f1", "background-mask-iou"]);
	});

	it("does not treat repeatable output as target quality when exact output differs", () => {
		const target = image(2, 1, [0, 0, 0, 255, 0, 0, 0, 0]);
		const actual = image(2, 1, [0, 0, 0, 255, 0, 0, 0, 255]);
		const metrics = calculateTargetMetrics(actual, target);
		expect(targetQualityFailures(metrics, { exact: true }, 2, 1, true)).toEqual(
			["exact-image-match"],
		);
	});
});
