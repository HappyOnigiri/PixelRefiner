import { describe, expect, it } from "vitest";
import type { Pixel, RawImage } from "../shared/types";
import { getPixel, posterize, setPixel, upscaleNearest } from "./ops";

describe("ops.ts", () => {
	describe("getPixel / setPixel", () => {
		it("should get and set pixels correctly", () => {
			const data = new Uint8ClampedArray(2 * 2 * 4);
			const img: RawImage = { width: 2, height: 2, data };
			const red: Pixel = [255, 0, 0, 255];

			setPixel(img, 1, 1, red);
			const pixel = getPixel(img, 1, 1);
			expect(pixel).toEqual(red);
		});

		it("should handle boundary values safely", () => {
			const data = new Uint8ClampedArray(2 * 2 * 4);
			const img: RawImage = { width: 2, height: 2, data };
			const blue: Pixel = [0, 0, 255, 255];

			// setPixel should ignore out of bounds
			setPixel(img, -1, 0, blue);
			setPixel(img, 2, 0, blue);
			setPixel(img, 0, -1, blue);
			setPixel(img, 0, 2, blue);

			// Memory should not be changed (all zero)
			for (let i = 0; i < data.length; i++) {
				expect(data[i]).toBe(0);
			}

			// getPixel should clamp coordinates
			setPixel(img, 0, 0, blue);
			expect(getPixel(img, -1, 0)).toEqual(blue); // clamped to (0,0)
			expect(getPixel(img, 0, -1)).toEqual(blue); // clamped to (0,0)

			setPixel(img, 1, 1, [255, 255, 255, 255]);
			expect(getPixel(img, 2, 1)).toEqual([255, 255, 255, 255]); // clamped to (1,1)
			expect(getPixel(img, 1, 2)).toEqual([255, 255, 255, 255]); // clamped to (1,1)
		});
	});

	describe("posterize", () => {
		it("should discretize colors correctly", () => {
			const width = 256;
			const height = 1;
			const data = new Uint8ClampedArray(width * height * 4);
			for (let i = 0; i < 256; i++) {
				data[i * 4] = i; // R: 0-255
				data[i * 4 + 1] = i; // G: 0-255
				data[i * 4 + 2] = i; // B: 0-255
				data[i * 4 + 3] = 255; // A
			}
			const img: RawImage = { width, height, data };
			const step = 64;
			const result = posterize(img, step);

			for (let i = 0; i < 256; i++) {
				const expectedValue = Math.floor(i / step) * step;
				expect(result.data[i * 4]).toBe(expectedValue);
				expect(result.data[i * 4 + 1]).toBe(expectedValue);
				expect(result.data[i * 4 + 2]).toBe(expectedValue);
				expect(result.data[i * 4 + 3]).toBe(255);
			}
		});

		it("should return same image when step = 1", () => {
			const data = new Uint8ClampedArray([10, 20, 30, 255]);
			const img: RawImage = { width: 1, height: 1, data };
			const result = posterize(img, 1);
			expect(result.data[0]).toBe(10);
			expect(result.data[1]).toBe(20);
			expect(result.data[2]).toBe(30);
		});

		it("should binarize to 0 or 255 when step = 255", () => {
			const data = new Uint8ClampedArray([
				0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 255, 255, 255,
				255,
			]);
			const img: RawImage = { width: 4, height: 1, data };
			const result = posterize(img, 255);

			// 0 -> 0
			expect(result.data[0]).toBe(0);
			// 100 -> floor(100/255)*255 = 0
			expect(result.data[4]).toBe(0);
			// 200 -> floor(200/255)*255 = 0
			expect(result.data[8]).toBe(0);
			// 255 -> floor(255/255)*255 = 255
			expect(result.data[12]).toBe(255);
		});
	});

	describe("upscaleNearest", () => {
		it("should upscale image 2x correctly using nearest neighbor", () => {
			// 2x2 image
			// [R, G]
			// [B, W]
			const data = new Uint8ClampedArray([
				255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
			]);
			const img: RawImage = { width: 2, height: 2, data };
			const scale = 2;
			const result = upscaleNearest(img, scale);

			expect(result.width).toBe(4);
			expect(result.height).toBe(4);

			// Check some pixels
			// (0,0) in 4x4 should be same as (0,0) in 2x2
			expect(getPixel(result, 0, 0)).toEqual([255, 0, 0, 255]);
			expect(getPixel(result, 1, 1)).toEqual([255, 0, 0, 255]);

			// (2,0) in 4x4 should be same as (1,0) in 2x2
			expect(getPixel(result, 2, 0)).toEqual([0, 255, 0, 255]);
			expect(getPixel(result, 3, 1)).toEqual([0, 255, 0, 255]);

			// (0,2) in 4x4 should be same as (0,1) in 2x2
			expect(getPixel(result, 0, 2)).toEqual([0, 0, 255, 255]);
			expect(getPixel(result, 1, 3)).toEqual([0, 0, 255, 255]);

			// (2,2) in 4x4 should be same as (1,1) in 2x2
			expect(getPixel(result, 2, 2)).toEqual([255, 255, 255, 255]);
			expect(getPixel(result, 3, 3)).toEqual([255, 255, 255, 255]);
		});
	});
});
