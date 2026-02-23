import { describe, expect, it } from "vitest";
import type { RGB } from "../shared/types";
import { oklabToRgb, rgbToOklab } from "./colorUtils";

describe("colorUtils.ts", () => {
	describe("rgbToOklab and oklabToRgb (Roundtrip)", () => {
		const testColors: { name: string; rgb: RGB }[] = [
			{ name: "Black", rgb: { r: 0, g: 0, b: 0 } },
			{ name: "White", rgb: { r: 255, g: 255, b: 255 } },
			{ name: "Red", rgb: { r: 255, g: 0, b: 0 } },
			{ name: "Green", rgb: { r: 0, g: 255, b: 0 } },
			{ name: "Blue", rgb: { r: 0, g: 0, b: 255 } },
			{ name: "Gray", rgb: { r: 128, g: 128, b: 128 } },
		];

		testColors.forEach(({ name, rgb }) => {
			it(`should correctly convert and reconvert (roundtrip) ${name}`, () => {
				const lab = rgbToOklab(rgb);
				const backRgb = oklabToRgb(lab);

				// Verify it's within tolerance of +/- 1
				expect(backRgb.r).toBeGreaterThanOrEqual(rgb.r - 1);
				expect(backRgb.r).toBeLessThanOrEqual(rgb.r + 1);
				expect(backRgb.g).toBeGreaterThanOrEqual(rgb.g - 1);
				expect(backRgb.g).toBeLessThanOrEqual(rgb.g + 1);
				expect(backRgb.b).toBeGreaterThanOrEqual(rgb.b - 1);
				expect(backRgb.b).toBeLessThanOrEqual(rgb.b + 1);
			});
		});
	});

	describe("oklabToRgb clipping", () => {
		it("should clip results to 0-255 range", () => {
			// Oklab with very large L (should exceed white)
			const brightLab = { L: 2.0, a: 0, b: 0 };
			const rgb = oklabToRgb(brightLab);
			expect(rgb.r).toBe(255);
			expect(rgb.g).toBe(255);
			expect(rgb.b).toBe(255);

			// Oklab with very small L (should be below black)
			const darkLab = { L: -1.0, a: 0, b: 0 };
			const darkRgb = oklabToRgb(darkLab);
			expect(darkRgb.r).toBe(0);
			expect(darkRgb.g).toBe(0);
			expect(darkRgb.b).toBe(0);
		});
	});
});
