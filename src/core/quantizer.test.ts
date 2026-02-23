import { describe, expect, it } from "vitest";
import type { PixelData } from "../shared/types";
import { OklabKMeans, PaletteQuantizer } from "./quantizer";

// PixelData generation helper
const px = (r: number, g: number, b: number, a = 255): PixelData => ({
	r,
	g,
	b,
	alpha: a,
});

describe("quantizer.ts", () => {
	describe("OklabKMeans", () => {
		it("should reduce colors to specified count", () => {
			const q = new OklabKMeans(2);
			const input = [
				px(255, 0, 0),
				px(250, 10, 10),
				px(0, 0, 255),
				px(10, 10, 250),
			];
			const result = q.quantize(input);
			const colors = new Set(result.map((p) => `${p.r},${p.g},${p.b}`));
			expect(colors.size).toBeLessThanOrEqual(2);
		});

		it("should maintain alpha=0 for transparent pixels", () => {
			const q = new OklabKMeans(2);
			const input = [px(255, 0, 0), px(0, 0, 0, 0), px(0, 0, 255)];
			const result = q.quantize(input);
			expect(result[1].alpha).toBe(0);
			// Color info for transparent pixels is either maintained or alpha remains 0 even if changed
		});
	});

	describe("OklabKMeans Edge Cases", () => {
		it("should not crash when input color count is less than specified count", () => {
			const q = new OklabKMeans(16); // Want to reduce to 16 colors
			const input = [
				px(255, 0, 0), // Red
				px(0, 0, 255), // Blue
				px(255, 0, 0), // Red
			];

			// Return without error
			expect(() => q.quantize(input)).not.toThrow();
			const result = q.quantize(input);

			// Colors remain same (or within 2 colors)
			const uniqueColors = new Set(result.map((p) => `${p.r},${p.g},${p.b}`));
			expect(uniqueColors.size).toBeLessThanOrEqual(2);
		});

		it("should not let Alpha=0 pixels affect centroid calculation", () => {
			const q = new OklabKMeans(1);
			const input = [
				px(255, 0, 0, 255), // Red (Opaque)
				px(0, 255, 0, 0), // Green (Transparent)
				px(0, 255, 0, 0), // Green (Transparent)
				px(0, 255, 0, 0), // Green (Transparent)
			];

			const result = q.quantize(input);
			// When reduced to 1 color, the opaque "Red" should be picked.
			// If transparent "Green" was included in calculation, the color would be mixed.
			expect(result[0].r).toBeGreaterThan(200);
			expect(result[0].g).toBeLessThan(50);
		});
	});

	describe("PaletteQuantizer", () => {
		it("should snap to the nearest palette color", () => {
			const palette = [px(255, 255, 255), px(0, 0, 0)];
			const q = new PaletteQuantizer(palette);
			const input = [px(128, 128, 128)]; // Gray
			const result = q.quantize(input);

			// 128,128,128 should snap to either 0,0,0 or 255,255,255 in Oklab distance
			const isBlackOrWhite = (p: PixelData) =>
				(p.r === 0 && p.g === 0 && p.b === 0) ||
				(p.r === 255 && p.g === 255 && p.b === 255);

			expect(isBlackOrWhite(result[0])).toBe(true);
		});
	});

	describe("Dithering Modes", () => {
		it("should support Bayer 2x2 dithering", () => {
			const q = new OklabKMeans(2);
			const input = [
				px(100, 100, 100),
				px(100, 100, 100),
				px(150, 150, 150),
				px(150, 150, 150),
			];
			const result = q.applyDithering(input, 2, 2, "bayer-2x2", 1.0);
			// Expect different palette colors to be assigned by threshold
			const colors = new Set(result.map((p) => `${p.r},${p.g},${p.b}`));
			expect(colors.size).toBeGreaterThan(1);
		});

		it("should support Ordered dithering", () => {
			const q = new OklabKMeans(2);
			const input = [
				px(100, 100, 100),
				px(100, 100, 100),
				px(150, 150, 150),
				px(150, 150, 150),
			];
			const result = q.applyDithering(input, 2, 2, "ordered", 1.0);
			const colors = new Set(result.map((p) => `${p.r},${p.g},${p.b}`));
			expect(colors.size).toBeGreaterThan(1);
		});
	});
});
