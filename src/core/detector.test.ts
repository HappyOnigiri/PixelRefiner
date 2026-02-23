import fs from "fs";
import path from "path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import type { Pixel, RawImage } from "../shared/types";
import { detectGrid, getRunLengths } from "./detector";

// detectGrid is not exported, but it's used internally by getRunLengths.
// We can verify its effect through getRunLengths.

describe("detector.ts (helpers)", () => {
	describe("getRunLengths", () => {
		const W: Pixel = [255, 255, 255, 255]; // White
		const K: Pixel = [0, 0, 0, 255]; // Black
		const T: Pixel = [0, 0, 0, 0]; // Transparent

		it("should correctly identify runs in a pixel strip", () => {
			// [W, W, W, K, K, W]
			const strip: Pixel[] = [W, W, W, K, K, W];
			const segments = getRunLengths(strip, 64);

			expect(segments.length).toBe(1);
			const runs = segments[0].runs;
			expect(runs.length).toBe(3);

			// Run 1: White, length 3
			expect(runs[0]).toMatchObject({
				start: 0,
				length: 3,
				color: [192, 192, 192], // 255 quantized by 64 is 192
			});

			// Run 2: Black, length 2
			expect(runs[1]).toMatchObject({
				start: 3,
				length: 2,
				color: [0, 0, 0],
			});

			// Run 3: White, length 1
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

			// Should result in two segments
			expect(segments.length).toBe(2);

			// Segment 1: [W]
			expect(segments[0].start).toBe(0);
			expect(segments[0].runs.length).toBe(1);
			expect(segments[0].runs[0].length).toBe(1);

			// Segment 2: [K, K]
			expect(segments[1].start).toBe(3);
			expect(segments[1].runs.length).toBe(1);
			expect(segments[1].runs[0].length).toBe(2);
		});

		it("should smooth out single pixel noise if it matches neighbors", () => {
			// [W, W, K, W, W, W] -> K is single pixel noise between Ws
			// The smoothing logic requires runs.length >= 3.
			// [W, W], [K], [W, W, W] are 3 runs.
			const strip: Pixel[] = [W, W, K, W, W, W];
			const segments = getRunLengths(strip, 64);

			expect(segments.length).toBe(1);
			const runs = segments[0].runs;

			// If smoothing works, it should be one single run of White
			// But wait, the current implementation might result in [W, W+1+W] -> [W, W]
			// Let's check the logic again.
			// Run 0: W, len 2
			// Run 1: K, len 1 -> prev=W, next=W -> smoothed.push(last.start, last.length+1, last.color)
			// Run 2: W, len 3 -> smoothed.push(run)
			// Result: [ {len: 3, color: W}, {len: 3, color: W} ]
			// They are NOT merged into one run in the smoothing loop.
			expect(runs.length).toBe(2);
			expect(runs[0].length).toBe(3);
			expect(runs[1].length).toBe(3);
			expect(runs[0].color).toEqual([192, 192, 192]);
			expect(runs[1].color).toEqual([192, 192, 192]);
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

			// Should not throw error
			expect(() => detectGrid(img)).not.toThrow();
		});
	});

	describe("estimateFromSegments (Unit Test)", () => {
		// estimateFromSegments is not exported, so we test it indirectly through detectGrid.
		// Here we verify accuracy using synthetic data.

		it("should detect correct cell size from perfect stripe patterns", () => {
			// 16x16, 8px period stripes
			// Black (0,0,0) and White (255,255,255) boundaries appear every 8px
			const width = 16;
			const height = 16;
			const data = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					// Change color every 8px
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
			// Restrict autoMaxCells to ensure 8px is picked (16/8 = 2 cells)
			const grid = detectGrid(img, { autoMaxCellsW: 2, autoMaxCellsH: 2 });

			expect(grid.cellW).toBe(8);
			expect(grid.cellH).toBe(8);
			expect(grid.offsetX).toBe(0);
			expect(grid.offsetY).toBe(0);
		});

		it("should detect correctly even with offsets", () => {
			// 24x24, 4px period, offset (2, 2)
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
			// 24 / 4 = 6 cells
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

		// User says: currently detects ~74x110 cells (large cells).
		// Expected: 2-3x more cells (smaller cells).
		// 1024 / 74 = ~13.8px
		// 1024 / 220 = ~4.6px

		// Assert that cell size is small (high resolution grid)
		// If current behavior is maintained, this should FAIL.
		expect(grid.cellW).toBeLessThan(10);
		expect(grid.cellH).toBeLessThan(10);

		expect(grid.outW).toBeGreaterThan(150);
		expect(grid.outH).toBeGreaterThan(150);
	});
});
