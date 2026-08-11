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
