import { describe, expect, it } from "vitest";
import type { Pixel, RawImage } from "../shared/types";
import { floodFillTransparent } from "./floodfill";
import { getPixel, setPixel } from "./ops";

describe("floodfill.ts", () => {
	describe("floodFillTransparent", () => {
		it("should fill connected color area with transparency", () => {
			// 5x5 image, white background
			const width = 5;
			const height = 5;
			const data = new Uint8ClampedArray(width * height * 4).fill(255); // White
			const img: RawImage = { width, height, data };

			// Draw a red box (2x2) at (1,1)
			const red: Pixel = [255, 0, 0, 255];
			setPixel(img, 1, 1, red);
			setPixel(img, 2, 1, red);
			setPixel(img, 1, 2, red);
			setPixel(img, 2, 2, red);

			// Fill from (1,1)
			floodFillTransparent(img, 1, 1, 0);

			// (1,1) should be transparent red
			expect(getPixel(img, 1, 1)).toEqual([255, 0, 0, 0]);
			expect(getPixel(img, 2, 2)).toEqual([255, 0, 0, 0]);

			// (0,0) should still be white
			expect(getPixel(img, 0, 0)).toEqual([255, 255, 255, 255]);
		});

		it("should respect tolerance", () => {
			const width = 3;
			const height = 1;
			const data = new Uint8ClampedArray(width * height * 4);
			const img: RawImage = { width, height, data };

			// [R=255, R=250, R=240]
			setPixel(img, 0, 0, [255, 0, 0, 255]);
			setPixel(img, 1, 0, [250, 0, 0, 255]);
			setPixel(img, 2, 0, [240, 0, 0, 255]);

			// Fill from (0,0) with tolerance 5
			// R=250 is within tolerance (255-250=5), R=240 is NOT (255-240=15)
			floodFillTransparent(img, 0, 0, 5);

			expect(getPixel(img, 0, 0)[3]).toBe(0); // Transparent
			expect(getPixel(img, 1, 0)[3]).toBe(0); // Transparent
			expect(getPixel(img, 2, 0)[3]).toBe(255); // Opaque
		});

		it("should not fill non-connected areas", () => {
			const width = 5;
			const height = 1;
			const data = new Uint8ClampedArray(width * height * 4).fill(255);
			const img: RawImage = { width, height, data };

			// [Red, White, Red, White, White]
			const red: Pixel = [255, 0, 0, 255];
			setPixel(img, 0, 0, red);
			setPixel(img, 2, 0, red);

			// Fill from (0,0)
			floodFillTransparent(img, 0, 0, 0);

			expect(getPixel(img, 0, 0)[3]).toBe(0); // Filled
			expect(getPixel(img, 1, 0)).toEqual([255, 255, 255, 255]); // White separator
			expect(getPixel(img, 2, 0)).toEqual([255, 0, 0, 255]); // Other red area (not connected)
		});
	});
});
