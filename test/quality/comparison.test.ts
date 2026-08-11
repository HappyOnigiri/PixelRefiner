import { describe, expect, it } from "vitest";
import type { RawImage } from "../../src/shared/types";
import { classifyChange, compareImages, compareMetrics } from "./comparison";
import {
	calculateTargetMetrics,
	meanRgbaError,
	targetQualityFailures,
} from "./metrics";
import type { QualityBaselineCase, QualityMetrics } from "./types";

const image = (pixels: number[], width = 2, height = 1): RawImage => ({
	width,
	height,
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

	it("classifies only baseline availability and decoded image differences", () => {
		expect(classifyChange(false, true)).toBe("new");
		expect(classifyChange(false, false)).toBe("new");
		expect(classifyChange(true, false)).toBe("unchanged");
		expect(classifyChange(true, true)).toBe("changed");

		const changedMetrics = {
			...metrics,
			meanRgbaError: 11,
			edgeF1: 0.9,
		};
		// [Intended] 指標の悪化・改善は前回比較の状態に入らない。上の真理値表が
		// classifyChange の引数を hasBaseline と imageChanged だけに閉じていることを示す。
		const comparison = compareMetrics(changedMetrics, baseline);
		expect(comparison.regressed).toEqual(["meanRgbaError"]);
		expect(comparison.improved).toEqual(["edgeF1"]);
	});

	it("treats size changes as image changes", () => {
		const before = image([0, 0, 0, 255, 10, 10, 10, 255]);
		const wider = image([0, 0, 0, 255, 10, 10, 10, 255, 20, 20, 20, 255], 3, 1);
		const taller = image(
			[0, 0, 0, 255, 10, 10, 10, 255, 0, 0, 0, 255, 10, 10, 10, 255],
			2,
			2,
		);
		expect(compareImages(wider, before).changed).toBe(true);
		expect(compareImages(taller, before).changed).toBe(true);
	});

	it("keeps target quality independent from the previous-image status", () => {
		const previous = image([0, 0, 0, 255, 10, 10, 10, 255]);
		const exactTarget = image([0, 0, 0, 255, 11, 10, 10, 255]);
		const targetMetrics = calculateTargetMetrics(exactTarget, exactTarget);
		expect(
			targetQualityFailures(
				targetMetrics,
				{ exact: true },
				exactTarget.width,
				exactTarget.height,
				true,
			),
		).toEqual([]);
		expect(
			classifyChange(true, compareImages(exactTarget, previous).changed),
		).toBe("changed");

		const unmetTarget = image([0, 0, 0, 255, 12, 10, 10, 255]);
		expect(
			targetQualityFailures(
				calculateTargetMetrics(previous, unmetTarget),
				{ exact: true },
				previous.width,
				previous.height,
				true,
			),
		).toEqual(["exact-image-match"]);
		expect(
			classifyChange(true, compareImages(previous, previous).changed),
		).toBe("unchanged");
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

	it("treats missing baseline metrics and passed-to-failed transitions as regressions", () => {
		const incompleteBaseline = {
			...baseline,
			edgeF1: undefined,
		} as unknown as QualityBaselineCase;
		expect(compareMetrics(metrics, incompleteBaseline).regressed).toContain(
			"edgeF1",
		);
		expect(compareMetrics(metrics, baseline, "failed").regressed).toContain(
			"status",
		);
	});

	it("ignores invisible RGB differences in fully transparent pixels", () => {
		const transparentBlack = image([0, 0, 0, 0, 10, 10, 10, 255]);
		const transparentWhite = image([255, 255, 255, 0, 10, 10, 10, 255]);
		expect(meanRgbaError(transparentBlack, transparentWhite)).toBe(0);
	});
});
