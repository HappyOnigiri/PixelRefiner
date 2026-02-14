import { describe, expect, it } from "vitest";
import type { RGB } from "../shared/types";
import {
	extractColorsFromImage,
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

describe("extractColorsFromImage", () => {
	/**
	 * Helper function to create ImageData for testing
	 * @param width - Width of the image
	 * @param height - Height of the image
	 * @param pixels - Array of [r, g, b] or [r, g, b, a] tuples
	 */
	const createImageData = (
		width: number,
		height: number,
		pixels: Array<[number, number, number] | [number, number, number, number]>,
	): ImageData => {
		const data = new Uint8ClampedArray(width * height * 4);

		for (let i = 0; i < pixels.length; i++) {
			const [r, g, b, a = 255] = pixels[i];
			data[i * 4] = r;
			data[i * 4 + 1] = g;
			data[i * 4 + 2] = b;
			data[i * 4 + 3] = a;
		}

		return {
			data,
			width,
			height,
			colorSpace: "srgb",
		} as ImageData;
	};

	it("should extract unique colors from image", () => {
		const imageData = createImageData(3, 1, [
			[255, 0, 0], // Red
			[0, 255, 0], // Green
			[255, 0, 0], // Red (duplicate)
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(2);
		expect(colors).toHaveLength(2);
		expect(colors).toContainEqual({ r: 255, g: 0, b: 0 });
		expect(colors).toContainEqual({ r: 0, g: 255, b: 0 });
	});

	it("should skip transparent pixels", () => {
		const imageData = createImageData(3, 1, [
			[255, 0, 0, 255], // Red (opaque)
			[0, 255, 0, 100], // Green (semi-transparent, < 128)
			[0, 0, 255, 128], // Blue (at threshold, should be included)
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(2);
		expect(colors).toContainEqual({ r: 255, g: 0, b: 0 });
		expect(colors).toContainEqual({ r: 0, g: 0, b: 255 });
		expect(colors).not.toContainEqual({ r: 0, g: 255, b: 0 });
	});

	it("should limit colors to maxColors", () => {
		const imageData = createImageData(5, 1, [
			[255, 255, 255], // White (brightest)
			[0, 0, 0], // Black (darkest)
			[255, 0, 0], // Red
			[0, 255, 0], // Green
			[0, 0, 255], // Blue
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData, 3);
		expect(totalColors).toBe(5);
		expect(colors).toHaveLength(3);
		// Should return the 3 brightest colors (sorted by luminance)
		expect(colors[0]).toEqual({ r: 255, g: 255, b: 255 }); // White
		expect(colors[1]).toEqual({ r: 0, g: 255, b: 0 }); // Green
		expect(colors[2]).toEqual({ r: 255, g: 0, b: 0 }); // Red
	});

	it("should sort colors by luminance when limiting", () => {
		const imageData = createImageData(4, 1, [
			[50, 50, 50], // Dark gray
			[200, 200, 200], // Light gray
			[100, 100, 100], // Medium gray
			[150, 150, 150], // Medium-Light gray
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData, 2);
		expect(totalColors).toBe(4);
		expect(colors).toHaveLength(2);
		// Should return the 2 brightest colors
		expect(colors[0]).toEqual({ r: 200, g: 200, b: 200 });
		expect(colors[1]).toEqual({ r: 150, g: 150, b: 150 });
	});

	it("should handle empty image", () => {
		const imageData = createImageData(0, 0, []);
		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(0);
		expect(colors).toHaveLength(0);
	});

	it("should handle fully transparent image", () => {
		const imageData = createImageData(2, 1, [
			[255, 0, 0, 0], // Transparent red
			[0, 255, 0, 50], // Transparent green
		]);
		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(0);
		expect(colors).toHaveLength(0);
	});

	it("should not limit when maxColors is undefined", () => {
		const imageData = createImageData(3, 1, [
			[255, 0, 0],
			[0, 255, 0],
			[0, 0, 255],
		]);
		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(3);
		expect(colors).toHaveLength(3);
	});
});
