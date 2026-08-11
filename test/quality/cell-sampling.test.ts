import { describe, expect, it } from "vitest";
import { processImage } from "../../src/core/processor";
import type { ProcessOptions } from "../../src/core/processor-options";
import { readPng } from "./image";
import { meanRgbaError } from "./metrics";

const commonOptions: ProcessOptions = {
	forcePixelsW: 6,
	forcePixelsH: 6,
	cellSamplingMode: "alpha-aware-medoid",
	maxSamplesPerCell: 64,
	cellAlphaThreshold: 16,
	preserveThinFeatures: true,
	sampleWindow: 3,
	preRemoveBackground: false,
	postRemoveBackground: false,
	bgRemovalScope: "off",
	bgExtractionMethod: "none",
	trimToContent: false,
	debug: false,
};

describe("PRF-130 quality comparison", () => {
	it("improves thin-feature and alpha-coverage restoration over legacy median", () => {
		const input = readPng("test/fixtures/quality_prf130_cell_sampling.png");
		const expected = readPng(
			"test/fixtures/quality_prf130_cell_sampling-expect.png",
		);
		const legacy = processImage(input, {
			...commonOptions,
			cellSamplingMode: "legacy-median",
		}).result;
		const restored = processImage(input, commonOptions).result;
		expect(meanRgbaError(legacy, expected)).toBeGreaterThan(20);
		expect(meanRgbaError(restored, expected)).toBe(0);
		expect(Array.from(restored.data)).toEqual(Array.from(expected.data));
	});
});

describe("default alpha sampling", () => {
	it("keeps pixel-art edges hard unless alpha coverage is enabled", () => {
		const input = readPng("test/fixtures/quality_alpha_blur.png");
		const options: ProcessOptions = {
			forcePixelsW: 8,
			forcePixelsH: 8,
			sampleWindow: 3,
			preRemoveBackground: false,
			postRemoveBackground: false,
			bgRemovalScope: "off",
			trimToContent: false,
		};
		const defaultResult = processImage(input, options).result;
		const alphaAwareResult = processImage(input, {
			...options,
			cellSamplingMode: "alpha-aware-medoid",
		}).result;
		const countPartialAlpha = (data: Uint8ClampedArray): number => {
			let count = 0;
			for (let index = 3; index < data.length; index += 4) {
				if (data[index] > 0 && data[index] < 255) count += 1;
			}
			return count;
		};

		expect(countPartialAlpha(defaultResult.data)).toBe(0);
		expect(countPartialAlpha(alphaAwareResult.data)).toBeGreaterThan(0);
	});
});
