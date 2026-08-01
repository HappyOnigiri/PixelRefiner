import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	FastGridSearchFromTrimmed,
	LegacyGridSearchFromTrimmed,
	processImage,
} from "./processor";
import {
	cleanDebugDir,
	expectSameImage,
	getExpectPath,
	makeDebugHook,
	readPngAsRawImage,
	UPDATE_EXPECT,
	writeRawImageAsPngSync,
} from "./processor-test-helpers";

describe("processImage modes", () => {
	describe("palette_conversion_gb: Palette Conversion (Game Boy)", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("palette_conversion_gb");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/palette_conversion_gb.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);
			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/palette_conversion_gb-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("should correctly convert to GB palette (4 colors) and match expected image", () => {
			// Run in Game Boy (Legacy) mode
			const { result } = processImage(img, {
				reduceColors: true,
				reduceColorMode: "gb_pocket",
				ditherStrength: 0,
				// Leave other processing OFF
				enableGridDetection: false,
				bgExtractionMethod: "none", // Background extraction OFF
				preRemoveBackground: false,
				postRemoveBackground: false,
				bgRemovalScope: "selected",
				trimToContent: false,
				debug: true,
			});

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expectSameImage(result, expected, getExpectPath("palette_conversion_gb"));
		});
	});

	describe("dithering_floyd_steinberg: Dithering (Floyd-Steinberg)", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("dithering_floyd_steinberg");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/dithering_floyd_steinberg.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);
			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/dithering_floyd_steinberg-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("should process with dithering and match expected image", () => {
			// 2 colors (Black & White) + Dithering
			const { result } = processImage(img, {
				reduceColors: true,
				reduceColorMode: "mono", // Monochrome
				ditherMode: "floyd-steinberg",
				ditherStrength: 100,
				enableGridDetection: false,
				bgExtractionMethod: "none", // Background extraction OFF
				preRemoveBackground: false,
				postRemoveBackground: false,
				bgRemovalScope: "selected",
				trimToContent: false,
				debug: true,
			});

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expectSameImage(
				result,
				expected,
				getExpectPath("dithering_floyd_steinberg"),
			);
		});
	});

	describe("keepAspectRatio", () => {
		let img: RawImage;

		beforeAll(async () => {
			cleanDebugDir("keepAspectRatio");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/auto_grid_detection.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);
		});

		it("should match expected image when keepAspectRatio is enabled", async () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				floatingMaxPixels: 0,
				autoGridFromTrimmed: true,
				keepAspectRatio: true,
				debugHook: makeDebugHook("keepAspectRatio", "match_expected_image"),
			});

			const expPath = getExpectPath("keep_aspect_ratio");
			if (UPDATE_EXPECT) {
				writeRawImageAsPngSync(expPath, result);
				return;
			}

			const expected = await readPngAsRawImage(expPath);
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(result.width);
			expect(grid.outH).toBe(result.height);

			expectSameImage(result, expected, expPath);
		}, 20_000);
	});

	describe("enableGridDetection", () => {
		beforeAll(() => {
			cleanDebugDir("enableGridDetection");
		});

		const mkImg = (): RawImage => {
			const w = 10;
			const h = 10;
			const data = new Uint8ClampedArray(w * h * 4);
			const set = (
				x: number,
				y: number,
				r: number,
				g: number,
				b: number,
				a: number,
			) => {
				const idx = (y * w + x) * 4;
				data[idx] = r;
				data[idx + 1] = g;
				data[idx + 2] = b;
				data[idx + 3] = a;
			};
			// background (white)
			for (let y = 0; y < h; y += 1) {
				for (let x = 0; x < w; x += 1) {
					set(x, y, 255, 255, 255, 255);
				}
			}
			// object: 4x4 black block at (2, 2)
			for (let y = 2; y < 6; y += 1) {
				for (let x = 2; x < 6; x += 1) {
					set(x, y, 0, 0, 0, 255);
				}
			}
			return { width: w, height: h, data };
		};

		it("should output at actual size without downsampling when enableGridDetection=false", () => {
			const img = mkImg();
			const { result, grid } = processImage(img, {
				enableGridDetection: false,
				trimToContent: false,
				debugHook: makeDebugHook(
					"enableGridDetection",
					"enableGridDetection=false_output_at_actual_size",
				),
			});

			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(grid.cellW).toBe(1);
			expect(grid.cellH).toBe(1);
		});

		it("should only perform trimming when enableGridDetection=false and trimToContent=true", () => {
			const img = mkImg();
			const { result, grid } = processImage(img, {
				enableGridDetection: false,
				trimToContent: true,
				preRemoveBackground: true,
				backgroundTolerance: 0,
				debugHook: makeDebugHook(
					"enableGridDetection",
					"enableGridDetection=false_trimToContent=true_only_trimming",
				),
			});

			// 4x4 black block at (2, 2)
			expect(result.width).toBe(4);
			expect(result.height).toBe(4);
			expect(grid.cropX).toBe(2);
			expect(grid.cropY).toBe(2);
			expect(grid.cellW).toBe(1);
			expect(grid.cellH).toBe(1);
		});

		it("should work with color reduction even when enableGridDetection=false", () => {
			const img = mkImg();
			const { result } = processImage(img, {
				enableGridDetection: false,
				reduceColors: true,
				reduceColorMode: "auto",
				colorCount: 2,
				debugHook: makeDebugHook(
					"enableGridDetection",
					"enableGridDetection=false_reduceColors=true",
				),
			});

			// Count colors
			const colors = new Set<number>();
			const data32 = new Uint32Array(result.data.buffer);
			for (let i = 0; i < data32.length; i++) {
				colors.add(data32[i]);
			}
			// Should be 2 colors: background (white) and object (black)
			expect(colors.size).toBeLessThanOrEqual(2);
		});
	});
	describe("makeSquare", () => {
		beforeAll(() => {
			cleanDebugDir("makeSquare");
		});

		it("should make wide image (landscape) square", async () => {
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/wide_red.png", import.meta.url),
			);
			const img = await readPngAsRawImage(imgPath);
			const { result, grid } = processImage(img, {
				trimToContent: false,
				preRemoveBackground: false,
				postRemoveBackground: false,
				makeSquare: true,
				enableGridDetection: false,
				debugHook: makeDebugHook(
					"makeSquare",
					"make_wide_image_landscape_square",
				),
			});

			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(grid.outW).toBe(10);
			expect(grid.outH).toBe(10);

			// Red pixels exist at center (y=3 when 10x4 image centered), upper/lower margins (0,0 etc) should be transparent
			const topAlpha = result.data[3]; // (0, 0). (0,0,0,0)
			expect(topAlpha).toBe(0);
			const centerAlpha = result.data[(3 * 10 + 0) * 4 + 3]; // (0, 3)
			expect(centerAlpha).toBe(255);
		});

		it("should make tall image (portrait) square", async () => {
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/tall_red.png", import.meta.url),
			);
			const img = await readPngAsRawImage(imgPath);
			const { result, grid } = processImage(img, {
				trimToContent: false,
				preRemoveBackground: false,
				postRemoveBackground: false,
				makeSquare: true,
				enableGridDetection: false,
				debugHook: makeDebugHook(
					"makeSquare",
					"make_tall_image_portrait_square",
				),
			});

			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(grid.outW).toBe(10);
			expect(grid.outH).toBe(10);

			// Red pixels exist at center (x=3 when 4x10 image centered), left/right margins (0,0 etc) should be transparent
			const leftEdgeAlpha = result.data[3]; // (0, 0)
			expect(leftEdgeAlpha).toBe(0);
			const centerAlpha = result.data[(0 * 10 + 3) * 4 + 3]; // (3, 0)
			expect(centerAlpha).toBe(255);
		});
	});

	describe("high_resolution", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("high_resolution");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/high_resolution.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/high_resolution-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("should correctly detect and process high-resolution images (small pixels)", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				// Based on user feedback, verify that high-resolution grids are detected
				// even with autoGridFromTrimmed: true by relaxing search range and adjusting penalties.
				autoGridFromTrimmed: true,
				debug: true,
				debugHook: makeDebugHook("high_resolution", "for_verification"),
			});

			// Verify detection results
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			// Image comparison
			expectSameImage(result, expected, getExpectPath("high_resolution"));
		}, 20_000);
	});

	describe("Grid Search Strategies Consistency", () => {
		it("should yield same results for Fast and Legacy modes (simple image)", () => {
			// Create 16x16 grid image (assuming 2x2 grid of 8x8 cells)
			const width = 16;
			const height = 16;
			const data = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const isCell1 = Math.floor(x / 8) % 2 === Math.floor(y / 8) % 2;
					const color = isCell1 ? 255 : 0;
					data[idx] = color;
					data[idx + 1] = color;
					data[idx + 2] = color;
					data[idx + 3] = 255;
				}
			}
			const img: RawImage = { width, height, data };
			const mask: RawImage = {
				width,
				height,
				data: new Uint8ClampedArray(data),
			};

			// Cast to access internal classes
			const legacy = new (
				LegacyGridSearchFromTrimmed as unknown as {
					new (): {
						search: (img: RawImage, mask: RawImage, sw: number) => unknown;
					};
				}
			)();
			const fast = new (
				FastGridSearchFromTrimmed as unknown as {
					new (): {
						search: (img: RawImage, mask: RawImage, sw: number) => unknown;
					};
				}
			)();

			const resLegacy = legacy.search(img, mask, 3) as {
				outW: number;
				outH: number;
			} | null;
			const resFast = fast.search(img, mask, 3) as {
				outW: number;
				outH: number;
			} | null;

			expect(resLegacy).not.toBeNull();
			expect(resFast).not.toBeNull();
			if (resLegacy && resFast) {
				expect(resFast.outW).toBe(resLegacy.outW);
				expect(resFast.outH).toBe(resLegacy.outH);
			}
		});
	});
});
