import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { normalizeGridPhase, searchPhaseAwareGrid } from "./grid-search";
import { processImage } from "./processor";

const createScaledGrid = (
	logicalWidth: number,
	logicalHeight: number,
	cellW: number,
	cellH: number,
	cropLeft = 0,
	cropTop = 0,
): RawImage => {
	const fullWidth = Math.round(logicalWidth * cellW);
	const fullHeight = Math.round(logicalHeight * cellH);
	const width = fullWidth - cropLeft;
	const height = fullHeight - cropTop;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const logicalY = Math.min(
			logicalHeight - 1,
			Math.floor((y + cropTop) / cellH),
		);
		for (let x = 0; x < width; x += 1) {
			const logicalX = Math.min(
				logicalWidth - 1,
				Math.floor((x + cropLeft) / cellW),
			);
			const value =
				(logicalX * 73 + logicalY * 151 + logicalX * logicalY * 29) % 256;
			const index = (y * width + x) * 4;
			data[index] = value;
			data[index + 1] = (value * 3 + logicalX * 17) % 256;
			data[index + 2] = (value * 5 + logicalY * 31) % 256;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};

const candidateSizes = (image: RawImage): Array<[number, number]> => {
	const estimate = searchPhaseAwareGrid(image, image);
	expect(estimate).not.toBeNull();
	if (!estimate) return [];
	return [estimate, ...(estimate.candidates ?? [])]
		.slice(0, 3)
		.map((candidate) => [candidate.outW, candidate.outH]);
};

const addTransparentPadding = (
	image: RawImage,
	left: number,
	top: number,
): RawImage => {
	const width = image.width + left;
	const height = image.height + top;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < image.height; y += 1) {
		const sourceStart = y * image.width * 4;
		const targetStart = ((y + top) * width + left) * 4;
		data.set(
			image.data.subarray(sourceStart, sourceStart + image.width * 4),
			targetStart,
		);
	}
	return { width, height, data };
};

describe("phase-aware grid search", () => {
	it("detects independent axis scales and crop phase", () => {
		const image = createScaledGrid(8, 7, 4, 3, 3, 2);
		const estimate = searchPhaseAwareGrid(image, image);
		expect(estimate).not.toBeNull();
		if (!estimate) return;
		expect(estimate.cellW).toBeCloseTo(4, 4);
		expect(estimate.cellH).toBeCloseTo(3, 4);
		expect(estimate.offsetX).toBeCloseTo(1, 4);
		expect(estimate.offsetY).toBeCloseTo(1, 4);
		expect(estimate.outW).toBe(8);
		expect(estimate.outH).toBe(7);
	});

	it.each([
		[2, 2],
		[32, 32],
	] as const)("searches %sx by %sx cells", (cellW, cellH) => {
		const image = createScaledGrid(8, 7, cellW, cellH);
		expect(candidateSizes(image)).toContainEqual([8, 7]);
	});

	it.each([
		[2.5, 2.5],
		[3.2, 3.2],
		[7.75, 4.5],
	] as const)(
		"keeps the correct non-integer %sx by %sx size in the top three",
		(cellW, cellH) => {
			const image = createScaledGrid(8, 8, cellW, cellH);
			expect(candidateSizes(image)).toContainEqual([8, 8]);
		},
	);

	it("normalizes BBox-local phases into original-image coordinates", () => {
		expect(normalizeGridPhase(3 + 1, 4)).toBe(0);
		expect(normalizeGridPhase(2 + 1, 4)).toBe(3);
		expect(normalizeGridPhase(-1, 4)).toBe(3);
	});

	it("publishes a non-integer correct size in the processing Top-3", () => {
		const image = createScaledGrid(8, 8, 2.5, 3.2);
		const { analysis } = processImage(image, {
			autoGridFromTrimmed: true,
			fastAutoGridFromTrimmed: true,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
			sampleWindow: 1,
		});
		const topThree = analysis.gridCandidates
			.filter((candidate) => candidate.method !== "preserve")
			.slice(0, 3)
			.map((candidate) => [candidate.outW, candidate.outH]);
		expect(topThree).toContainEqual([8, 8]);
	});

	it.each([1, 2, 3])(
		"propagates a %spx BBox shift without changing full-image grid boundaries",
		(padding) => {
			const image = addTransparentPadding(
				createScaledGrid(8, 8, 4, 3),
				padding,
				padding,
			);
			const { analysis } = processImage(image, {
				autoGridFromTrimmed: true,
				fastAutoGridFromTrimmed: true,
				bgRemovalScope: "off",
				preRemoveBackground: false,
				postRemoveBackground: false,
				trimToContent: false,
				sampleWindow: 1,
			});
			const candidate = analysis.gridCandidates.find(
				(report) =>
					Math.abs(report.grid.cellW - 4) < 1e-4 &&
					Math.abs(report.grid.cellH - 3) < 1e-4 &&
					Math.abs(report.grid.offsetX - (padding % 4)) < 1e-4 &&
					Math.abs(report.grid.offsetY - (padding % 3)) < 1e-4,
			);
			expect(candidate).toBeDefined();
		},
	);

	it("returns deterministically for empty-signal and tiny inputs", () => {
		const image: RawImage = {
			width: 1,
			height: 1,
			data: new Uint8ClampedArray([0, 0, 0, 0]),
		};
		expect(searchPhaseAwareGrid(image, image)).toEqual(
			searchPhaseAwareGrid(image, image),
		);
	});
});
