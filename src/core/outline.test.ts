import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { applyOutline } from "./outline";

describe("applyOutline", () => {
	const createTestImage = (width: number, height: number): RawImage => {
		const data = new Uint8ClampedArray(width * height * 4);
		return { width, height, data };
	};

	it("should return the same image when style is 'none'", () => {
		const img = createTestImage(10, 10);
		const result = applyOutline(img, { r: 255, g: 255, b: 255 }, "none");
		expect(result).toBe(img);
	});

	it("should expand image size by 2px (1px each side)", () => {
		const img = createTestImage(3, 3);
		const result = applyOutline(img, { r: 255, g: 255, b: 255 }, "sharp");
		expect(result.width).toBe(5);
		expect(result.height).toBe(5);
	});

	it("should add outline in sharp (4-way) style", () => {
		// 3x3 image with one opaque pixel at center (1, 1)
		// Expanded to 5x5, original center is at (2, 2)
		const img = createTestImage(3, 3);
		const centerIdx = (1 * 3 + 1) * 4;
		img.data[centerIdx + 3] = 255; // opaque

		const result = applyOutline(img, { r: 255, g: 0, b: 0 }, "sharp");
		const W = 5;

		// Neighbors of (2, 2): (2, 1), (2, 3), (1, 2), (3, 2) should be red
		const red = [255, 0, 0, 255];
		const check = (x: number, y: number, expected: number[]) => {
			const idx = (y * W + x) * 4;
			expect([
				result.data[idx],
				result.data[idx + 1],
				result.data[idx + 2],
				result.data[idx + 3],
			]).toEqual(expected);
		};

		check(2, 2, [0, 0, 0, 255]); // Original center remains
		check(2, 1, red); // Top
		check(2, 3, red); // Bottom
		check(1, 2, red); // Left
		check(3, 2, red); // Right
		check(1, 1, [0, 0, 0, 0]); // Corner remains transparent
	});

	it("should add outline in rounded (8-way) style", () => {
		// 3x3 image with one opaque pixel at center (1, 1)
		// Expanded to 5x5, original center is at (2, 2)
		const img = createTestImage(3, 3);
		const centerIdx = (1 * 3 + 1) * 4;
		img.data[centerIdx + 3] = 255; // opaque

		const result = applyOutline(img, { r: 255, g: 0, b: 0 }, "rounded");
		const W = 5;

		const red = [255, 0, 0, 255];
		const check = (x: number, y: number, expected: number[]) => {
			const idx = (y * W + x) * 4;
			expect([
				result.data[idx],
				result.data[idx + 1],
				result.data[idx + 2],
				result.data[idx + 3],
			]).toEqual(expected);
		};

		// All 8 neighbors of (2, 2) should be red
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) {
					check(2, 2, [0, 0, 0, 255]);
				} else {
					check(2 + dx, 2 + dy, red);
				}
			}
		}
	});

	it("should handle image boundaries by expanding", () => {
		// 2x2 image with opaque pixel at (0, 0)
		// Expanded to 4x4, original pixel is at (1, 1)
		const img = createTestImage(2, 2);
		img.data[3] = 255; // (0, 0) alpha

		const result = applyOutline(img, { r: 255, g: 0, b: 0 }, "sharp");
		const W = 4;

		const red = [255, 0, 0, 255];
		const check = (x: number, y: number, expected: number[]) => {
			const idx = (y * W + x) * 4;
			expect([
				result.data[idx],
				result.data[idx + 1],
				result.data[idx + 2],
				result.data[idx + 3],
			]).toEqual(expected);
		};

		check(1, 1, [0, 0, 0, 255]); // Original (0,0) moved to (1,1)
		check(2, 1, red); // Right neighbor
		check(1, 2, red); // Bottom neighbor
		check(0, 1, red); // Left neighbor (newly possible due to expansion)
		check(1, 0, red); // Top neighbor (newly possible due to expansion)
	});
});
