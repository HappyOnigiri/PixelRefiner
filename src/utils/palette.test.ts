import { describe, expect, it } from "vitest";
import type { RGB } from "../shared/types";
import {
	findNearestColor,
	generateGPL,
	parseGPL,
	sortPalette,
} from "./palette";

describe("palette utils", () => {
	describe("parseGPL", () => {
		it("should parse valid GPL content", () => {
			const gpl = `GIMP Palette
Name: Test Palette
Columns: 4
# comment
255   0   0 Red
  0 255   0 Green
  0   0 255 Blue
`;
			const result = parseGPL(gpl);
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ r: 255, g: 0, b: 0 });
			expect(result[1]).toEqual({ r: 0, g: 255, b: 0 });
			expect(result[2]).toEqual({ r: 0, g: 0, b: 255 });
		});

		it("should handle empty lines and comments", () => {
			const gpl = `GIMP Palette
# comment

255 255 255 White
`;
			const result = parseGPL(gpl);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ r: 255, g: 255, b: 255 });
		});

		it("should ignore invalid lines", () => {
			const gpl = `GIMP Palette
Invalid Line Here
255 0 0
`;
			const result = parseGPL(gpl);
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ r: 255, g: 0, b: 0 });
		});
	});

	describe("generateGPL", () => {
		it("should generate valid GPL content", () => {
			const colors: RGB[] = [
				{ r: 255, g: 0, b: 0 },
				{ r: 0, g: 255, b: 0 },
			];
			const result = generateGPL(colors, "My Palette");
			expect(result).toContain("GIMP Palette");
			expect(result).toContain("Name: My Palette");
			expect(result).toContain("255   0   0\t#FF0000");
			expect(result).toContain("  0 255   0\t#00FF00");
		});
	});

	describe("findNearestColor", () => {
		it("should find nearest color", () => {
			const palette: RGB[] = [
				{ r: 0, g: 0, b: 0 },
				{ r: 255, g: 255, b: 255 },
			];
			const target: RGB = { r: 10, g: 10, b: 10 };
			const result = findNearestColor(target, palette);
			expect(result).toEqual({ r: 0, g: 0, b: 0 });
		});

		it("should handle single color palette", () => {
			const palette: RGB[] = [{ r: 100, g: 100, b: 100 }];
			const target: RGB = { r: 200, g: 200, b: 200 };
			const result = findNearestColor(target, palette);
			expect(result).toEqual({ r: 100, g: 100, b: 100 });
		});

		it("should return target if palette is empty", () => {
			const palette: RGB[] = [];
			const target: RGB = { r: 50, g: 50, b: 50 };
			const result = findNearestColor(target, palette);
			expect(result).toEqual(target);
		});
	});

	describe("sortPalette", () => {
		it("should sort palette by luminance (bright to dark)", () => {
			const palette: RGB[] = [
				{ r: 255, g: 255, b: 255 }, // White
				{ r: 0, g: 0, b: 0 }, // Black
				{ r: 255, g: 0, b: 0 }, // Red
				{ r: 0, g: 255, b: 0 }, // Green
				{ r: 0, g: 0, b: 255 }, // Blue
			];
			// Luminance (Rec 601):
			// White: 255
			// Green: ~150
			// Red: ~76
			// Blue: ~29
			// Black: 0
			// Expected: White, Green, Red, Blue, Black
			const sorted = sortPalette(palette);
			expect(sorted[0]).toEqual({ r: 255, g: 255, b: 255 });
			expect(sorted[1]).toEqual({ r: 0, g: 255, b: 0 });
			expect(sorted[2]).toEqual({ r: 255, g: 0, b: 0 });
			expect(sorted[3]).toEqual({ r: 0, g: 0, b: 255 });
			expect(sorted[4]).toEqual({ r: 0, g: 0, b: 0 });
		});

		it("should handle mixed brightness", () => {
			const palette: RGB[] = [
				{ r: 50, g: 50, b: 50 }, // Dark Gray
				{ r: 200, g: 200, b: 200 }, // Light Gray
			];
			const sorted = sortPalette(palette);
			expect(sorted[0]).toEqual({ r: 200, g: 200, b: 200 });
			expect(sorted[1]).toEqual({ r: 50, g: 50, b: 50 });
		});
	});
});
