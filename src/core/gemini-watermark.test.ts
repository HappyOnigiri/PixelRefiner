import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { removeAutomaticBackground } from "./background";
import { getBackgroundTargets, removeBackground } from "./background-removal";
import { removeGeminiWatermark } from "./gemini-watermark";
import { processImage } from "./processor";
import { readPngAsRawImage } from "./processor-test-helpers";

const createSyntheticImage = (touchSubject: boolean): RawImage => {
	const width = 100;
	const height = 100;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 20; y <= 45; y += 1) {
		for (let x = 20; x <= (touchSubject ? 90 : 45); x += 1) {
			const offset = (y * width + x) * 4;
			data[offset] = 40;
			data[offset + 1] = 70;
			data[offset + 2] = 100;
			data[offset + 3] = 255;
		}
	}
	for (let y = 86; y <= 94; y += 1) {
		for (let x = 86; x <= 94; x += 1) {
			if (Math.abs(x - 90) + Math.abs(y - 90) > 4) continue;
			const offset = (y * width + x) * 4;
			data[offset] = 240;
			data[offset + 1] = 240;
			data[offset + 2] = 240;
			data[offset + 3] = 255;
		}
	}
	if (touchSubject) {
		for (let coordinate = 46; coordinate <= 86; coordinate += 1) {
			const offset = (coordinate * width + 90) * 4;
			data[offset] = 40;
			data[offset + 1] = 70;
			data[offset + 2] = 100;
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
};

const alphaAt = (image: RawImage, x: number, y: number): number =>
	image.data[(y * image.width + x) * 4 + 3];

const withOpaqueBackground = (image: RawImage): RawImage => {
	const data = new Uint8ClampedArray(image.data);
	for (let offset = 0; offset < data.length; offset += 4) {
		if (data[offset + 3] !== 0) continue;
		data[offset] = 80;
		data[offset + 1] = 140;
		data[offset + 2] = 80;
		data[offset + 3] = 255;
	}
	return { width: image.width, height: image.height, data };
};

describe("Gemini watermark removal", () => {
	it("removes an isolated bright diamond in the bottom-right corner", () => {
		const image = createSyntheticImage(false);
		const result = removeGeminiWatermark(image);

		expect(result.removed).toBe(true);
		expect(result.removedPixels).toBe(41);
		expect(alphaAt(result.image, 90, 90)).toBe(0);
		expect(alphaAt(result.image, 30, 30)).toBe(255);
		expect(alphaAt(image, 90, 90)).toBe(255);
	});

	it("keeps a mark connected to the subject", () => {
		const image = createSyntheticImage(true);
		const result = removeGeminiWatermark(image);

		expect(result.removed).toBe(false);
		expect(result.image).toBe(image);
		expect(alphaAt(result.image, 90, 90)).toBe(255);
	});

	it("keeps processing geometry and honors the explicit Off mode", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const options = {
			processingMode: "preserve" as const,
			enableGridDetection: false,
			preRemoveBackground: true,
			postRemoveBackground: true,
			bgExtractionMethod: "top-left" as const,
			bgRemovalScope: "outer" as const,
			backgroundTolerance: 0,
			trimToContent: false,
			smallComponentMode: "off" as const,
		};
		const automatic = processImage(image, options);
		const disabled = processImage(image, {
			...options,
			geminiWatermarkRemoval: "off",
		});

		expect(automatic.result.width).toBe(disabled.result.width);
		expect(automatic.result.height).toBe(disabled.result.height);
		expect(automatic.grid).toEqual(disabled.grid);
		expect(alphaAt(automatic.result, 90, 90)).toBe(0);
		expect(alphaAt(disabled.result, 90, 90)).toBe(255);
		expect(alphaAt(automatic.result, 30, 30)).toBe(255);
	});

	for (const fixture of [
		"high_resolution",
		"inner_background_removal",
		"no_trimming",
	]) {
		it(`detects the isolated watermark in ${fixture}`, async () => {
			const image = await readPngAsRawImage(`test/fixtures/${fixture}.png`);
			const background = removeAutomaticBackground(image, 64, "outer", "4");
			const detectionMask = background.rolledBack
				? removeBackground(
						image,
						64,
						"outer",
						"4",
						getBackgroundTargets(image, "top-left"),
						"top-left",
					)
				: background.image;
			const result = removeGeminiWatermark(image, detectionMask);

			expect(result.removed).toBe(true);
			expect(result.removedPixels).toBeGreaterThan(0);
		});
	}
});
