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
			// Game Boy（Legacy）モードで実行する
			const { result } = processImage(img, {
				reduceColors: true,
				reduceColorMode: "gb_pocket",
				ditherStrength: 0,
				// 他の処理は OFF のままにする
				enableGridDetection: false,
				bgExtractionMethod: "none", // 背景抽出 OFF
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
			// 2 色（黒と白）+ ディザリング
			const { result } = processImage(img, {
				reduceColors: true,
				reduceColorMode: "mono", // モノクロ
				ditherMode: "floyd-steinberg",
				ditherStrength: 100,
				enableGridDetection: false,
				bgExtractionMethod: "none", // 背景抽出 OFF
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
				bgExtractionMethod: "top-left",
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				cellSamplingMode: "legacy-median",
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
			// 背景（白）
			for (let y = 0; y < h; y += 1) {
				for (let x = 0; x < w; x += 1) {
					set(x, y, 255, 255, 255, 255);
				}
			}
			// オブジェクト: (2, 2) の 4x4 黒ブロック
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

			// (2, 2) の 4x4 黒ブロック
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

			// 色数を数える
			const colors = new Set<number>();
			const data32 = new Uint32Array(result.data.buffer);
			for (let i = 0; i < data32.length; i++) {
				colors.add(data32[i]);
			}
			// 背景（白）とオブジェクト（黒）の 2 色になるはずである
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

			// 赤ピクセルは中央にあり（10x4 画像を中央揃えした場合の y=3）、上下の余白（(0,0) など）は透明になるはずである
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

			// 赤ピクセルは中央にあり（4x10 画像を中央揃えした場合の x=3）、左右の余白（(0,0) など）は透明になるはずである
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
				bgExtractionMethod: "top-left",
				detectionQuantStep: 64,
				preRemoveBackground: true,
				postRemoveBackground: true,
				bgRemovalScope: "all",
				backgroundTolerance: 64,
				sampleWindow: 3,
				cellSamplingMode: "legacy-median",
				trimToContent: true,
				trimAlphaThreshold: 16,
				// ユーザーフィードバックに基づき、検索範囲の緩和とペナルティ調整により、
				// autoGridFromTrimmed: true でも高解像度グリッドが検出されることを確認する。
				autoGridFromTrimmed: true,
				debug: true,
				debugHook: makeDebugHook("high_resolution", "for_verification"),
			});

			// 検出結果を確認する
			expect(result.width).toBe(expected.width);
			expect(result.height).toBe(expected.height);
			expect(grid.outW).toBe(expected.width);
			expect(grid.outH).toBe(expected.height);

			// 画像比較
			expectSameImage(result, expected, getExpectPath("high_resolution"));
		});
	});

	describe("Grid Search Strategies Consistency", () => {
		it("should yield same results for Fast and Legacy modes (simple image)", () => {
			// 16x16 のグリッド画像を作成する（8x8 セルの 2x2 グリッドを想定）
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

			// 内部クラスへアクセスするためキャストする
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
