import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import type { Pixel, RawImage } from "../shared/types";
import { detectGrid, getRunLengths } from "./detector";

// detectGrid はエクスポートされていないが、getRunLengths の内部で使用される。
// getRunLengths を通じてその効果を検証できる。

describe("detector.ts (helpers)", () => {
	describe("getRunLengths", () => {
		const W: Pixel = [255, 255, 255, 255]; // 白
		const K: Pixel = [0, 0, 0, 255]; // 黒
		const T: Pixel = [0, 0, 0, 0]; // 透明

		it("should correctly identify runs in a pixel strip", () => {
			// [W, W, W, K, K, W]
			const strip: Pixel[] = [W, W, W, K, K, W];
			const segments = getRunLengths(strip, 64);

			expect(segments.length).toBe(1);
			const runs = segments[0].runs;
			expect(runs.length).toBe(3);

			// 連続領域 1: 白、長さ 3
			expect(runs[0]).toMatchObject({
				start: 0,
				length: 3,
				color: [192, 192, 192], // 255 を 64 で量子化すると 192
			});

			// 連続領域 2: 黒、長さ 2
			expect(runs[1]).toMatchObject({
				start: 3,
				length: 2,
				color: [0, 0, 0],
			});

			// 連続領域 3: 白、長さ 1
			expect(runs[2]).toMatchObject({
				start: 5,
				length: 1,
				color: [192, 192, 192],
			});
		});

		it("should skip transparent pixels based on alpha threshold", () => {
			// [W, T, T, K, K]
			const strip: Pixel[] = [W, T, T, K, K];
			const segments = getRunLengths(strip, 64, 16);

			// 2 つのセグメントになるはずである
			expect(segments.length).toBe(2);

			// セグメント 1: [W]
			expect(segments[0].start).toBe(0);
			expect(segments[0].runs.length).toBe(1);
			expect(segments[0].runs[0].length).toBe(1);

			// セグメント 2: [K, K]
			expect(segments[1].start).toBe(3);
			expect(segments[1].runs.length).toBe(1);
			expect(segments[1].runs[0].length).toBe(2);
		});

		it("merges matching runs after smoothing single-pixel noise", () => {
			// [W, W, K, W, W, W] -> K は W の間にある単一ピクセルのノイズ
			// 平滑化ロジックには runs.length >= 3 が必要である。
			// [W, W]、[K]、[W, W, W] は 3 つの連続領域である。
			const strip: Pixel[] = [W, W, K, W, W, W];
			const segments = getRunLengths(strip, 64);

			expect(segments.length).toBe(1);
			const runs = segments[0].runs;

			expect(runs.length).toBe(1);
			expect(runs[0].length).toBe(6);
			expect(runs[0].color).toEqual([192, 192, 192]);
		});
	});

	describe("detectGrid (edge cases)", () => {
		it("should handle 1x1 image without error", () => {
			const img: RawImage = {
				width: 1,
				height: 1,
				data: new Uint8ClampedArray([255, 255, 255, 255]),
			};
			const grid = detectGrid(img);
			expect(grid.outW).toBe(1);
			expect(grid.outH).toBe(1);
		});

		it("should handle solid color image without crashing", () => {
			const width = 16;
			const height = 16;
			const data = new Uint8ClampedArray(width * height * 4).fill(255);
			const img: RawImage = { width, height, data };

			const grid = detectGrid(img);
			expect(grid.outW).toBe(width);
			expect(grid.outH).toBe(height);
			expect(grid.detectionFailedAxes).toEqual(["x", "y"]);
		});

		it.each([
			[1, 32],
			[32, 1],
		])("handles a %ix%i thin image", (width, height) => {
			const img: RawImage = {
				width,
				height,
				data: new Uint8ClampedArray(width * height * 4),
			};
			expect(() => detectGrid(img)).not.toThrow();
		});

		it("ignores RGB garbage in fully transparent pixels", () => {
			const createImage = (withGarbage: boolean): RawImage => {
				const width = 32;
				const height = 32;
				const data = new Uint8ClampedArray(width * height * 4);
				for (let y = 0; y < height; y += 1) {
					for (let x = 0; x < width; x += 1) {
						const index = (y * width + x) * 4;
						const inSubject = x >= 8 && x < 24 && y >= 8 && y < 24;
						if (inSubject) {
							const value = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
							data[index] = value * 255;
							data[index + 1] = value * 255;
							data[index + 2] = value * 255;
							data[index + 3] = 255;
						} else if (withGarbage) {
							data[index] = (x * 31 + y * 17) % 256;
							data[index + 1] = (x * 13 + y * 47) % 256;
							data[index + 2] = (x * 59 + y * 7) % 256;
						}
					}
				}
				return { width, height, data };
			};
			const clean = detectGrid(createImage(false));
			const garbage = detectGrid(createImage(true));

			expect(garbage).toEqual(clean);
		});

		it("uses the configured background mask tolerance", () => {
			const width = 32;
			const height = 32;
			const data = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y += 1) {
				for (let x = 0; x < width; x += 1) {
					const index = (y * width + x) * 4;
					const foreground = x >= 8 && x < 24 && y >= 8 && y < 24;
					const value = foreground ? ((x + y) % 2) * 255 : 64 + ((x + y) % 7);
					data[index] = value;
					data[index + 1] = value;
					data[index + 2] = value;
					data[index + 3] = 255;
				}
			}
			const img: RawImage = { width, height, data };
			const exact = detectGrid(img, {
				detectionQuantStep: 1,
				backgroundMaskTolerance: 0,
			});
			const tolerant = detectGrid(img, {
				detectionQuantStep: 1,
				backgroundMaskTolerance: 8,
			});

			expect(tolerant).not.toEqual(exact);
		});
	});

	describe("estimateFromSegments (Unit Test)", () => {
		// estimateFromSegments はエクスポートされていないため、detectGrid を通じて間接的にテストする。
		// ここでは合成データを使って精度を検証する。

		it("should detect correct cell size from perfect stripe patterns", () => {
			// 16x16、周期 8px の縞模様
			// 黒（0,0,0）と白（255,255,255）の境界が 8px ごとに現れる
			const width = 16;
			const height = 16;
			const data = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					// 8px ごとに色を変える
					const isBlack =
						Math.floor(x / 8) % 2 === 0 && Math.floor(y / 8) % 2 === 0;
					const color = isBlack ? 0 : 255;
					data[idx] = color;
					data[idx + 1] = color;
					data[idx + 2] = color;
					data[idx + 3] = 255;
				}
			}
			const img: RawImage = { width, height, data };
			// 8px が選ばれるよう autoMaxCells を制限する（16/8 = 2 セル）
			const grid = detectGrid(img, { autoMaxCellsW: 2, autoMaxCellsH: 2 });

			expect(grid.cellW).toBe(8);
			expect(grid.cellH).toBe(8);
			expect(grid.offsetX).toBe(0);
			expect(grid.offsetY).toBe(0);
		});

		it("should detect correctly even with offsets", () => {
			// 24x24、周期 4px、オフセット (2, 2)
			const width = 24;
			const height = 24;
			const cell = 4;
			const offX = 2;
			const offY = 2;
			const data = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const isBlack =
						Math.floor((x - offX) / cell) % 2 === 0 &&
						Math.floor((y - offY) / cell) % 2 === 0;
					const color = isBlack ? 0 : 255;
					data[idx] = color;
					data[idx + 1] = color;
					data[idx + 2] = color;
					data[idx + 3] = 255;
				}
			}
			const img: RawImage = { width, height, data };
			// 24 / 4 = 6 セル
			const grid = detectGrid(img, { autoMaxCellsW: 6, autoMaxCellsH: 6 });

			expect(grid.cellW).toBe(cell);
			expect(grid.cellH).toBe(cell);
			expect(grid.offsetX).toBe(offX);
			expect(grid.offsetY).toBe(offY);
		});
	});
});

describe("detectGrid (reproduction)", () => {
	it("should detect small grid cells in high resolution image", async () => {
		const imagePath = path.resolve(
			__dirname,
			"../../test/fixtures/high_resolution.png",
		);
		if (!fs.existsSync(imagePath)) {
			console.warn("Skipping high_resolution test: file not found");
			return;
		}
		const buffer = fs.readFileSync(imagePath);
		const png = PNG.sync.read(buffer);

		const img: RawImage = {
			width: png.width,
			height: png.height,
			data: new Uint8ClampedArray(png.data),
		};

		const grid = detectGrid(img);

		// ユーザー報告: 現在は約 74x110 セル（大きなセル）を検出する。
		// 期待値: 2〜3 倍のセル数（小さなセル）。
		// 1024 / 74 = 約 13.8px
		// 1024 / 220 = 約 4.6px

		// セルサイズが小さいこと（高解像度グリッド）を検証する
		// 現在の挙動が維持されている場合、これは失敗するはずである。
		expect(grid.cellW).toBeLessThan(10);
		expect(grid.cellH).toBeLessThan(10);

		expect(grid.outW).toBeGreaterThan(150);
		expect(grid.outH).toBeGreaterThan(150);
	});
});
