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

const rgbAt = (image: RawImage, x: number, y: number): number[] => {
	const offset = (y * image.width + x) * 4;
	return Array.from(image.data.slice(offset, offset + 3));
};

const setPixel = (
	image: RawImage,
	x: number,
	y: number,
	r: number,
	g: number,
	b: number,
): void => {
	const offset = (y * image.width + x) * 4;
	image.data[offset] = r;
	image.data[offset + 1] = g;
	image.data[offset + 2] = b;
	image.data[offset + 3] = 255;
};

const withOpaqueBackground = (
	image: RawImage,
	background: [number, number, number] = [80, 140, 80],
): RawImage => {
	const data = new Uint8ClampedArray(image.data);
	for (let offset = 0; offset < data.length; offset += 4) {
		if (data[offset + 3] !== 0) continue;
		data[offset] = background[0];
		data[offset + 1] = background[1];
		data[offset + 2] = background[2];
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

	it("keeps a mark with even one dark subject pixel attached", () => {
		const image = createSyntheticImage(false);
		setPixel(image, 85, 90, 40, 70, 100);
		const result = removeGeminiWatermark(image);

		expect(result.removed).toBe(false);
		expect(alphaAt(result.image, 90, 90)).toBe(255);
		expect(alphaAt(result.image, 85, 90)).toBe(255);
	});

	it("keeps a mark with an asymmetric bright subject pixel attached", () => {
		const image = createSyntheticImage(false);
		setPixel(image, 85, 90, 240, 240, 240);
		const result = removeGeminiWatermark(image);

		expect(result.removed).toBe(false);
		expect(alphaAt(result.image, 90, 90)).toBe(255);
		expect(alphaAt(result.image, 85, 90)).toBe(255);
	});

	it("keeps a mark with symmetric bright subject pixels attached", () => {
		const image = createSyntheticImage(false);
		setPixel(image, 85, 90, 240, 240, 240);
		setPixel(image, 95, 90, 240, 240, 240);
		const result = removeGeminiWatermark(image);

		expect(result.removed).toBe(false);
		expect(alphaAt(result.image, 90, 90)).toBe(255);
		expect(alphaAt(result.image, 85, 90)).toBe(255);
		expect(alphaAt(result.image, 95, 90)).toBe(255);
	});

	it("keeps an unrelated pixel inside the matched bounding box", () => {
		const image = createSyntheticImage(false);
		setPixel(image, 86, 86, 20, 20, 20);
		const result = removeGeminiWatermark(image);

		expect(result.removed).toBe(true);
		expect(alphaAt(result.image, 90, 90)).toBe(0);
		expect(alphaAt(result.image, 86, 86)).toBe(255);
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

	it("uses the selected background connectivity when deciding isolation", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		for (let y = 0; y < image.height; y += 1) {
			setPixel(image, 50, y, 10, 10, 10);
		}
		const result = processImage(image, {
			processingMode: "preserve",
			enableGridDetection: false,
			bgExtractionMethod: "top-left",
			bgRemovalScope: "selected",
			backgroundTolerance: 0,
			trimToContent: false,
			smallComponentMode: "off",
		});

		// [Intended] 右側の背景は選択角と非連結なので、そこにある星形も透過対象にしない。
		expect(alphaAt(result.result, 90, 90)).toBe(255);
	});

	it("does not create a transparent hole when background removal is disabled", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const result = processImage(image, {
			processingMode: "preserve",
			enableGridDetection: false,
			preRemoveBackground: false,
			postRemoveBackground: false,
			bgExtractionMethod: "top-left",
			bgRemovalScope: "outer",
			trimToContent: false,
			smallComponentMode: "off",
		});

		expect(alphaAt(result.result, 90, 90)).toBe(255);
	});

	it("fills from nearby background when automatic background removal rolls back", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const options = {
			processingMode: "preserve" as const,
			enableGridDetection: false,
			bgExtractionMethod: "auto" as const,
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

		expect(automatic.analysis.warnings).toContain("BACKGROUND_REMOVAL_SKIPPED");
		expect(alphaAt(automatic.result, 90, 90)).toBe(255);
		expect(rgbAt(automatic.result, 90, 90)).toEqual([80, 140, 80]);
		expect(rgbAt(disabled.result, 90, 90)).toEqual([240, 240, 240]);
	});

	it("fills from a bright background when automatic removal rolls back", () => {
		const image = withOpaqueBackground(
			createSyntheticImage(false),
			[220, 220, 220],
		);
		const result = processImage(image, {
			processingMode: "preserve",
			enableGridDetection: false,
			bgExtractionMethod: "auto",
			bgRemovalScope: "outer",
			backgroundTolerance: 0,
			trimToContent: false,
			smallComponentMode: "off",
		});

		expect(result.analysis.warnings).toContain("BACKGROUND_REMOVAL_SKIPPED");
		expect(alphaAt(result.result, 90, 90)).toBe(255);
		expect(rgbAt(result.result, 90, 90)).toEqual([220, 220, 220]);
	});

	it("does not use a nearby subject color for rollback background fill", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		for (let y = 80; y <= 84; y += 1) {
			for (let x = 84; x <= 96; x += 1) {
				setPixel(image, x, y, 10, 10, 10);
			}
		}
		const result = processImage(image, {
			processingMode: "preserve",
			enableGridDetection: false,
			bgExtractionMethod: "auto",
			bgRemovalScope: "outer",
			backgroundTolerance: 0,
			trimToContent: false,
			smallComponentMode: "off",
		});

		expect(rgbAt(result.result, 90, 90)).toEqual([80, 140, 80]);
	});

	it("removes mapped cells after a fixed palette darkens the watermark", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const result = processImage(image, {
			processingMode: "preserve",
			enableGridDetection: false,
			bgExtractionMethod: "top-left",
			bgRemovalScope: "outer",
			backgroundTolerance: 0,
			trimToContent: false,
			smallComponentMode: "off",
			fixedPalette: [
				{ r: 0, g: 0, b: 0 },
				{ r: 255, g: 0, b: 0 },
			],
		});

		expect(alphaAt(result.result, 90, 90)).toBe(0);
	});

	it("uses the processed palette color when automatic removal rolls back", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const result = processImage(image, {
			processingMode: "preserve",
			enableGridDetection: false,
			bgExtractionMethod: "auto",
			bgRemovalScope: "outer",
			backgroundTolerance: 0,
			trimToContent: false,
			smallComponentMode: "off",
			fixedPalette: [
				{ r: 0, g: 0, b: 0 },
				{ r: 255, g: 0, b: 0 },
			],
		});

		expect(result.analysis.warnings).toContain("BACKGROUND_REMOVAL_SKIPPED");
		const processedBackground = rgbAt(result.result, 75, 90);
		expect(processedBackground).toEqual([255, 0, 0]);
		expect(rgbAt(result.result, 90, 90)).toEqual(processedBackground);
	});

	it("uses transparent output background after automatic removal rolls back", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const options = {
			processingMode: "convert" as const,
			forcePixelsW: 14,
			forcePixelsH: 14,
			bgExtractionMethod: "auto" as const,
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
		let removedBrightCells = 0;
		let transparentCells = 0;
		for (
			let pixel = 0;
			pixel < automatic.result.width * automatic.result.height;
			pixel += 1
		) {
			const offset = pixel * 4;
			if (automatic.result.data[offset + 3] === 0) transparentCells += 1;
			const disabledLuminance =
				(77 * disabled.result.data[offset] +
					150 * disabled.result.data[offset + 1] +
					29 * disabled.result.data[offset + 2]) >>
				8;
			if (
				automatic.result.data[offset + 3] === 0 &&
				disabled.result.data[offset + 3] !== 0 &&
				disabledLuminance >= 168
			) {
				removedBrightCells += 1;
			}
		}

		// 原寸の事前除去はロールバックするが、出力解像度の事後除去が透過を作るため、
		// 「透過を中止した」警告は出さない。
		expect(automatic.analysis.warnings).not.toContain(
			"BACKGROUND_REMOVAL_SKIPPED",
		);
		expect(transparentCells).toBeGreaterThan(0);
		expect(removedBrightCells).toBeGreaterThan(0);
	});

	it("excludes the watermark from forced-size crop bounds", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const options = {
			processingMode: "convert" as const,
			forcePixelsW: 20,
			forcePixelsH: 20,
			bgExtractionMethod: "top-left" as const,
			bgRemovalScope: "outer" as const,
			backgroundTolerance: 0,
			trimToContent: true,
			smallComponentMode: "off" as const,
		};
		const automatic = processImage(image, options);
		const disabled = processImage(image, {
			...options,
			geminiWatermarkRemoval: "off",
		});
		expect(automatic.result.width).toBe(20);
		expect(automatic.result.height).toBe(20);
		expect(automatic.grid.cropW).toBe(26);
		expect(automatic.grid.cropH).toBe(26);
		expect(automatic.grid.cropW).toBeLessThan(disabled.grid.cropW ?? 0);
		expect(automatic.grid.cropH).toBeLessThan(disabled.grid.cropH ?? 0);
		expect(automatic.grid.cropX).toBeGreaterThan(0);
		expect(automatic.grid.cropY).toBeGreaterThan(0);
	});

	it("covers the full watermark area when forced size upscales", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		const result = processImage(image, {
			processingMode: "convert",
			forcePixelsW: 200,
			forcePixelsH: 200,
			bgExtractionMethod: "top-left",
			bgRemovalScope: "outer",
			backgroundTolerance: 0,
			trimToContent: false,
			smallComponentMode: "off",
		});
		let brightRemaining = 0;
		for (let y = 140; y < result.result.height; y += 1) {
			for (let x = 140; x < result.result.width; x += 1) {
				const offset = (y * result.result.width + x) * 4;
				const luminance =
					(77 * result.result.data[offset] +
						150 * result.result.data[offset + 1] +
						29 * result.result.data[offset + 2]) >>
					8;
				if (result.result.data[offset + 3] !== 0 && luminance >= 168) {
					brightRemaining += 1;
				}
			}
		}
		expect(brightRemaining).toBe(0);
	});

	it("keeps a coarse output cell containing another foreground component", () => {
		const image = withOpaqueBackground(createSyntheticImage(false));
		for (let y = 80; y <= 85; y += 1) {
			for (let x = 80; x <= 85; x += 1) {
				setPixel(image, x, y, 10, 10, 10);
			}
		}
		const options = {
			processingMode: "convert" as const,
			forcePixelsW: 10,
			forcePixelsH: 10,
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

		expect(alphaAt(disabled.result, 8, 8)).toBe(255);
		expect(rgbAt(automatic.result, 8, 8)).toEqual(rgbAt(disabled.result, 8, 8));
		expect(alphaAt(automatic.result, 8, 8)).toBe(255);
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

	it("matches the high-resolution target geometry after removal", async () => {
		const image = await readPngAsRawImage("test/fixtures/high_resolution.png");
		const target = await readPngAsRawImage(
			"test/quality/targets/auto-high-resolution.png",
		);
		const result = processImage(image);

		expect(result.result.width).toBe(target.width);
		expect(result.result.height).toBe(target.height);
		let totalError = 0;
		for (let offset = 0; offset < result.result.data.length; offset += 1) {
			totalError += Math.abs(result.result.data[offset] - target.data[offset]);
		}
		expect(totalError / result.result.data.length).toBeLessThan(3);
	}, 30_000);
});
