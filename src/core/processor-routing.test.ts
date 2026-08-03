import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { processImage } from "./processor";
import { readPngAsRawImage } from "./processor-test-helpers";

const createNativePixelArt = (): RawImage => {
	const width = 8;
	const height = 8;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			const value =
				(Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 32 : 224;
			data[index] = value;
			data[index + 1] = value;
			data[index + 2] = value;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};

const createContinuousImage = (): RawImage => {
	const width = 32;
	const height = 32;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			data[index] = x * 7;
			data[index + 1] = y * 7;
			data[index + 2] = (x * 3 + y * 5) % 256;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};

const safeOptions = {
	debug: false,
	processingMode: "auto",
	preRemoveBackground: false,
	postRemoveBackground: false,
	bgRemovalScope: "off",
	bgExtractionMethod: "none",
	trimToContent: false,
} as const;

describe("processing router", () => {
	it("preserves native pixel art at its original size", () => {
		const image = createNativePixelArt();
		const processed = processImage(image, safeOptions);

		expect(processed.analysis.classification).toBe("native-pixel");
		expect(processed.analysis.route).toBe("preserve");
		expect(processed.result).toEqual(image);
		expect(processed.analysis.classificationReasons).toEqual([
			"NATIVE_PIXEL_STRUCTURE",
		]);
	});

	it("routes continuous tone to a non-destructive convert candidate", () => {
		const image = createContinuousImage();
		const processed = processImage(image, safeOptions);

		expect(processed.analysis.classification).toBe("continuous");
		expect(processed.analysis.route).toBe("convert");
		expect(processed.result).toEqual(image);
	});

	it("allows an explicit route to override automatic classification", () => {
		const processed = processImage(createContinuousImage(), {
			...safeOptions,
			processingMode: "preserve",
		});

		expect(processed.analysis.classification).toBeUndefined();
		expect(processed.analysis.route).toBe("preserve");
	});

	it.each([
		["quality_reference.png", "native-pixel", "preserve", 8, 8],
		["quality_nearest_2x.png", "scaled-pixel", "refine", 8, 8],
		["quality_bilinear.png", "soft-pixel", "refine", 8, 8],
		["quality_continuous_tone.png", "continuous", "convert", 48, 32],
	] as const)(
		"classifies and routes the %s quality fixture",
		async (fileName, classification, route, width, height) => {
			const image = await readPngAsRawImage(
				fileURLToPath(
					new URL(`../../test/fixtures/${fileName}`, import.meta.url),
				),
			);
			const processed = processImage(image, {
				...safeOptions,
				cellSamplingMode: "legacy-median",
				sampleWindow: fileName === "quality_nearest_2x.png" ? 1 : 3,
			});

			expect(processed.analysis.classification).toBe(classification);
			expect(processed.analysis.route).toBe(route);
			expect(processed.result.width).toBe(width);
			expect(processed.result.height).toBe(height);
		},
	);
});
