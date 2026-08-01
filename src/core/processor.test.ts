import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { processImage } from "./processor";
import {
	cleanDebugDir,
	expectSameImage,
	getExpectPath,
	makeDebugHook,
	readPngAsRawImage,
	UPDATE_EXPECT,
	writeRawImageAsPngSync,
} from "./processor-test-helpers";

describe("processImage", () => {
	describe("forcePixelsW/H", () => {
		beforeAll(() => {
			cleanDebugDir("forcePixelsW_H");
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
			// main object: 4x4 black block at (1..4, 1..4)
			for (let y = 1; y <= 4; y += 1) {
				for (let x = 1; x <= 4; x += 1) {
					set(x, y, 0, 0, 0, 255);
				}
			}
			// floating noise: 1px at (8, 8) (position that doesn't foul the corner seed)
			set(8, 8, 0, 0, 0, 255);
			return { width: w, height: h, data };
		};

		it("should not let BBox be pulled by floating noise if floatingMaxPixels > 0 even for specified pixels", () => {
			const img = mkImg();

			const base = {
				forcePixelsW: 8,
				forcePixelsH: 8,
				detectionQuantStep: 64,
				preRemoveBackground: false,
				postRemoveBackground: false,
				bgRemovalScope: "selected",
				backgroundTolerance: 0,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				autoGridFromTrimmed: false,
			} as const;

			const { grid: gridNoIgnore } = processImage(img, {
				...base,
				floatingMaxPixels: 0,
				debugHook: makeDebugHook("forcePixelsW_H", "floatingMaxPixels=0"),
			});
			// BBox including floating noise (8,8): x=1..8, y=1..8 => 8x8
			expect(gridNoIgnore.cropW).toBe(8);
			expect(gridNoIgnore.cropH).toBe(8);

			const { grid: gridIgnore } = processImage(img, {
				...base,
				floatingMaxPixels: 4,
				debugHook: makeDebugHook("forcePixelsW_H", "floatingMaxPixels=4"),
			});
			// BBox after removing floating noise: x=1..4, y=1..4 => 4x4
			expect(gridIgnore.cropW).toBe(4);
			expect(gridIgnore.cropH).toBe(4);
		});
	});

	describe("resize_and_remove_bg", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("resize_and_remove_bg");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_and_remove_bg.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);
			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_and_remove_bg-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("should match expected image perfectly when fast mode OFF and floating noise OFF", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,
				autoGridFromTrimmed: true,
				fastAutoGridFromTrimmed: false, // Fast mode OFF
				floatingMaxPixels: 0, // Floating noise OFF
				debugHook: makeDebugHook(
					"resize_and_remove_bg",
					"fastModeOFF(fastAutoGridFromTrimmed=false)_floatingNoiseOFF(floatingMaxPixels=0)_matchExpectedImage",
				),
			});

			if (UPDATE_EXPECT) {
				writeRawImageAsPngSync(getExpectPath("resize_and_remove_bg"), result);
				return;
			}
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);
			expectSameImage(result, expected, getExpectPath("resize_and_remove_bg"));
		});
	});

	describe("resize_with_trimming", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("resize_with_trimming");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_with_trimming.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/resize_with_trimming-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("should force convert to 46x13 when forcePixelsW/H=46/13 and match expected image perfectly", () => {
			const baseOpts = {
				forcePixelsW: 46,
				forcePixelsH: 13,
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 64,

				floatingMaxPixels: 0,
				autoGridFromTrimmed: true,
			} as const;

			const { result, grid } = processImage(img, {
				...baseOpts,
				forcePixelsW: 46,
				forcePixelsH: 13,
				debugHook: makeDebugHook(
					"resize_with_trimming",
					"forcePixelsW_H=46_13_force_conversion_match_expected",
				),
			});

			// Perfect match with expected PNG (size and pixels)
			expect(result.width).toBe(46);
			expect(result.height).toBe(13);
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(46);
			expect(grid.outH).toBe(13);

			expectSameImage(result, expected, getExpectPath("resize_with_trimming"));
			const { result: resultTrim, grid: gridTrim } = processImage(img, {
				...baseOpts,
				trimToContent: true,
				debugHook: makeDebugHook(
					"resize_with_trimming",
					"size_does_not_change_even_with_trimToContent=true",
				),
			});
			expect(resultTrim.width).toBe(46);
			expect(resultTrim.height).toBe(13);
			expect(gridTrim.outW).toBe(46);
			expect(gridTrim.outH).toBe(13);
		});
	});

	describe("auto_grid_detection", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("auto_grid_detection");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/auto_grid_detection.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/auto_grid_detection-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		// [Policy] Grid detection can exceed Vitest's 5s default under shared CI runner load.
		it("should match expected image perfectly (size and pixels)", () => {
			const { result, grid, analysis } = processImage(img, {
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
				debugHook: makeDebugHook(
					"auto_grid_detection",
					"match_expected_image_size_pixels",
				),
			});

			// Perfect match with expected PNG (size and pixels)
			expect(result.width).toBe(88);
			expect(result.height).toBe(61);
			expect(expected.width).toBe(88);
			expect(expected.height).toBe(61);

			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(88);
			expect(grid.outH).toBe(61);
			expect(analysis.warnings).not.toContain("LOW_GRID_CONFIDENCE");

			expectSameImage(result, expected, getExpectPath("auto_grid_detection"));
		}, 15_000);
	});

	describe("inner_background_removal", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("inner_background_removal");
			const imgPath = fileURLToPath(
				new URL(
					"../../test/fixtures/inner_background_removal.png",
					import.meta.url,
				),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL(
					"../../test/fixtures/inner_background_removal-expect.png",
					import.meta.url,
				),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("should match expected image perfectly (size and pixels)", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 96,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,

				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"inner_background_removal",
					"match_expected_image_size_pixels",
				),
			});

			if (UPDATE_EXPECT) {
				writeRawImageAsPngSync(
					getExpectPath("inner_background_removal"),
					result,
				);
				return;
			}
			// Perfect match with expected PNG (size and pixels)
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			expectSameImage(
				result,
				expected,
				getExpectPath("inner_background_removal"),
			);
		});

		it("should also remove background colors trapped inside (donut hole)", () => {
			const { result } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 96,
				sampleWindow: 3,
				trimToContent: true,
				trimAlphaThreshold: 16,

				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"inner_background_removal",
					"inner_background_donut_hole_also_removable",
				),
			});

			// Verify that alpha near center (inner background) becomes 0
			const cx = Math.floor(result.width / 2);
			const cy = Math.floor(result.height / 2);
			const alphas: number[] = [];
			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					const x = Math.min(result.width - 2, Math.max(1, cx + dx));
					const y = Math.min(result.height - 2, Math.max(1, cy + dy));
					const a = result.data[(y * result.width + x) * 4 + 3];
					alphas.push(a);
				}
			}
			expect(alphas.some((a) => a === 0)).toBe(true);
		});
	});

	describe("no_trimming", () => {
		let img: RawImage;
		let expected: RawImage;

		beforeAll(async () => {
			cleanDebugDir("no_trimming");
			const imgPath = fileURLToPath(
				new URL("../../test/fixtures/no_trimming.png", import.meta.url),
			);
			img = await readPngAsRawImage(imgPath);

			const expPath = fileURLToPath(
				new URL("../../test/fixtures/no_trimming-expect.png", import.meta.url),
			);
			expected = await readPngAsRawImage(expPath);
		});

		it("should match expected image even when trimToContent is OFF", () => {
			const { result, grid } = processImage(img, {
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 32,
				sampleWindow: 3,
				trimToContent: false, // Turn OFF auto trimming
				trimAlphaThreshold: 16,

				floatingMaxPixels: 50000,
				autoGridFromTrimmed: true,
				debugHook: makeDebugHook(
					"no_trimming",
					"match_expected_even_with_trimToContent_OFF",
				),
			});

			// Perfect match with expected PNG (size and pixels)
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			expectSameImage(result, expected, getExpectPath("no_trimming"));
		});
	});
});
