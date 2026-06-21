import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	FastGridSearchFromTrimmed,
	LegacyGridSearchFromTrimmed,
	processImage,
} from "./processor";

const DEBUG_IMAGES = Boolean(process.env.PIXELATE_DEBUG_IMAGES);
const UPDATE_EXPECT = Boolean(process.env.UPDATE_EXPECT);
const DEBUG_ROOT = path.resolve("tmp/debug/test");

const readPngAsRawImage = async (filePath: string): Promise<RawImage> => {
	const buf = await readFile(filePath);
	const png = PNG.sync.read(buf);
	return {
		width: png.width,
		height: png.height,
		data: new Uint8ClampedArray(png.data),
	};
};

const writeRawImageAsPngSync = (outPath: string, img: RawImage): void => {
	const png = new PNG({ width: img.width, height: img.height });
	png.data = Buffer.from(img.data);
	const buf = PNG.sync.write(png);
	writeFileSync(outPath, buf);
};

/**
 * RGB values of fully transparent pixels (alpha=0) in PNG do not affect visual appearance,
 * but depending on the generator tool, RGB might be zero-filled or retain original values, which can cause differences.
 * In tests, we normalize RGB to 0 when alpha=0 before comparison.
 */
const normalizeTransparentRgb = (img: RawImage): Uint8ClampedArray => {
	const out = new Uint8ClampedArray(img.data);
	for (let i = 0; i < out.length; i += 4) {
		const a = out[i + 3];
		if (a === 0) {
			out[i] = 0;
			out[i + 1] = 0;
			out[i + 2] = 0;
		}
	}
	return out;
};

/**
 * Verify images match exactly (provides shorter messages to trace causes without heavy diffs on mismatch).
 *
 * Vitest's `toEqual(Buffer)` can be extremely slow on mismatch due to large diff generation,
 * so here we report truthiness evaluation by `Buffer.equals()` + coordinates of the first difference.
 */
const expectSameImage = (
	actual: RawImage,
	expected: RawImage,
	expectPath?: string,
): void => {
	if (UPDATE_EXPECT && expectPath) {
		writeRawImageAsPngSync(expectPath, actual);
		return;
	}
	expect(actual.width).toBe(expected.width);
	expect(actual.height).toBe(expected.height);

	const a = Buffer.from(normalizeTransparentRgb(actual));
	const b = Buffer.from(normalizeTransparentRgb(expected));

	if (a.equals(b)) return;

	let first = -1;
	for (let i = 0; i < a.length && i < b.length; i += 1) {
		if (a[i] !== b[i]) {
			first = i;
			break;
		}
	}
	if (first < 0) {
		throw new Error(
			`Image mismatch (length difference) actual=${a.length} expected=${b.length}`,
		);
	}

	const pixel = (first / 4) | 0;
	const ch = first % 4;
	const x = pixel % actual.width;
	const y = (pixel / actual.width) | 0;
	throw new Error(
		`Image mismatch: firstDiff=idx${first} (x=${x}, y=${y}, ch=${ch}) actual=${a[first]} expected=${b[first]}`,
	);
};

const getExpectPath = (fixtureBase: string): string =>
	fileURLToPath(
		new URL(`../../test/fixtures/${fixtureBase}-expect.png`, import.meta.url),
	);

const sanitizeForPath = (s: string): string => {
	const out = s
		.trim()
		.replace(/[\\/]/g, "_")
		.replace(/[:*?"<>|]/g, "_")
		.replace(/\s+/g, "_");
	return out.length > 0 ? out.slice(0, 120) : "unnamed";
};

const cleanDebugDir = (testcaseName: string): void => {
	if (!DEBUG_IMAGES) return;
	// `make test-debug` runs `rm -rf tmp/debug` first, so recreate the root itself.
	mkdirSync(DEBUG_ROOT, { recursive: true });
	const dir = path.join(DEBUG_ROOT, sanitizeForPath(testcaseName));
	rmSync(dir, { recursive: true, force: true });

	// Cleanup for legacy format (from when currentTestName was used directly as directory name).
	// e.g. prevents long directories like processImage___test6__... from remaining.
	const legacyPrefix = `processImage___${sanitizeForPath(testcaseName)}__`;
	try {
		for (const e of readdirSync(DEBUG_ROOT, { withFileTypes: true })) {
			if (!e.isDirectory()) continue;
			if (!e.name.startsWith(legacyPrefix)) continue;
			rmSync(path.join(DEBUG_ROOT, e.name), { recursive: true, force: true });
		}
	} catch {
		// Just in case: skip cleanup if DEBUG_ROOT doesn't exist
	}
};

const makeDebugHook = (testcaseName: string, testName: string) => {
	if (!DEBUG_IMAGES) return undefined;

	const dir = path.join(
		DEBUG_ROOT,
		sanitizeForPath(testcaseName),
		sanitizeForPath(testName),
	);
	mkdirSync(dir, { recursive: true });

	return (name: string, raw: RawImage) => {
		const filename = `${sanitizeForPath(name)}.png`;
		writeRawImageAsPngSync(path.join(dir, filename), raw);
	};
};

declare global {
	var __PIXEL_REFINER_DEBUG_HOOK__:
		| ((name: string, img: RawImage, meta?: Record<string, unknown>) => void)
		| undefined;
}

const fnv1a32Base36 = (s: string): string => {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
};

const currentTestDebugDir = (): string => {
	const current = expect.getState().currentTestName ?? "unknown-test";
	const parts = current
		.split(">")
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	const groupCandidate =
		parts.find((p) => /^test\d+\b/.test(p)) ??
		parts[1] ??
		parts[0] ??
		"unknown";
	const m = /^test(\d+)\b/.exec(groupCandidate);
	const group = sanitizeForPath(m ? `test${m[1]}` : groupCandidate);

	const caseCandidate = parts[parts.length - 1] ?? current;
	const label = sanitizeForPath(caseCandidate).slice(0, 32);
	const hash = fnv1a32Base36(current).slice(0, 6);
	const caseDir = label.length > 0 ? `${label}__${hash}` : hash;

	return path.join(DEBUG_ROOT, group, caseDir);
};

// When `processImage({ debug: true })`, ensure intermediate images/final result (99-result)
// are output even if `debugHook` is not passed on the test side.
if (DEBUG_IMAGES) {
	globalThis.__PIXEL_REFINER_DEBUG_HOOK__ = (name, raw) => {
		const dir = currentTestDebugDir();
		mkdirSync(dir, { recursive: true });
		const filename = `${sanitizeForPath(name)}.png`;
		writeRawImageAsPngSync(path.join(dir, filename), raw);
	};
} else {
	globalThis.__PIXEL_REFINER_DEBUG_HOOK__ = undefined;
}

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

		it("should match expected image perfectly (size and pixels)", () => {
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

			expectSameImage(result, expected, getExpectPath("auto_grid_detection"));
		});
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
		});
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
		});
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
