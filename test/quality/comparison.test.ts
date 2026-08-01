import { describe, expect, it } from "vitest";
import type { RawImage } from "../../src/shared/types";
import { classifyChange, compareImages, compareMetrics } from "./comparison";
import { meanRgbaError } from "./metrics";
import type { QualityBaselineCase, QualityMetrics } from "./types";

const image = (pixels: number[]): RawImage => ({
	width: 2,
	height: 1,
	data: new Uint8ClampedArray(pixels),
});

const baseline: QualityBaselineCase = {
	id: "case",
	status: "passed",
	outputWidth: 2,
	outputHeight: 1,
	meanRgbaError: 10,
	edgeF1: 0.8,
	backgroundMaskIou: 0.7,
	smallComponentRetention: 1,
	catastrophicFailure: false,
};

const metrics: QualityMetrics = {
	outputWidth: 2,
	outputHeight: 1,
	sizeCorrect: true,
	top3SizeCorrect: true,
	gridPhaseError: 0,
	meanRgbaError: 10,
	edgeF1: 0.8,
	backgroundMaskIou: 0.7,
	smallComponentRetention: 1,
	byteIdentical: true,
	catastrophicFailure: false,
	runtimeMs: 1,
	approxPeakBytes: 24,
};

describe("quality comparison", () => {
	it("detects decoded RGBA changes and their bounding box", () => {
		const before = image([0, 0, 0, 255, 10, 10, 10, 255]);
		const after = image([0, 0, 0, 255, 11, 10, 10, 255]);
		expect(compareImages(before, before)).toMatchObject({
			changed: false,
			changedPixelCount: 0,
		});
		expect(compareImages(after, before)).toEqual({
			changed: true,
			changedPixelCount: 1,
			changedPixelRate: 0.5,
			diffBoundingBox: { x: 1, y: 0, width: 1, height: 1 },
		});
	});

	it("separates image changes from quality regressions", () => {
		const changedMetrics = {
			...metrics,
			meanRgbaError: 11,
			edgeF1: 0.9,
		};
		const comparison = compareMetrics(changedMetrics, baseline);
		expect(comparison.regressed).toEqual(["meanRgbaError"]);
		expect(comparison.improved).toEqual(["edgeF1"]);
		expect(
			classifyChange(true, true, comparison.regressed, comparison.improved),
		).toBe("regressed");
		expect(classifyChange(true, true, [], [])).toBe("changed");
		expect(classifyChange(false, true, [], [])).toBe("new");
	});

	it("allows only serialization-level metric differences", () => {
		expect(
			compareMetrics({ ...metrics, meanRgbaError: 10.0000005 }, baseline)
				.regressed,
		).toEqual([]);
		expect(
			compareMetrics({ ...metrics, meanRgbaError: 10.000002 }, baseline)
				.regressed,
		).toEqual(["meanRgbaError"]);
	});

	it("ignores invisible RGB differences in fully transparent pixels", () => {
		const transparentBlack = image([0, 0, 0, 0, 10, 10, 10, 255]);
		const transparentWhite = image([255, 255, 255, 0, 10, 10, 10, 255]);
		expect(meanRgbaError(transparentBlack, transparentWhite)).toBe(0);
	});
});
