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
		// 中央 (1, 1) に不透明ピクセルが 1 つある 3x3 画像
		// 5x5 に拡張後、元の中央は (2, 2)
		const img = createTestImage(3, 3);
		const centerIdx = (1 * 3 + 1) * 4;
		img.data[centerIdx + 3] = 255; // 不透明

		const result = applyOutline(img, { r: 255, g: 0, b: 0 }, "sharp");
		const W = 5;

		// (2, 2) の近傍 (2, 1)、(2, 3)、(1, 2)、(3, 2) は赤になるはずである
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

		check(2, 2, [0, 0, 0, 255]); // 元の中央は残る
		check(2, 1, red); // 上
		check(2, 3, red); // 下
		check(1, 2, red); // 左
		check(3, 2, red); // 右
		check(1, 1, [0, 0, 0, 0]); // 角は透明のまま
	});

	it("should add outline in rounded (8-way) style", () => {
		// 中央 (1, 1) に不透明ピクセルが 1 つある 3x3 画像
		// 5x5 に拡張後、元の中央は (2, 2)
		const img = createTestImage(3, 3);
		const centerIdx = (1 * 3 + 1) * 4;
		img.data[centerIdx + 3] = 255; // 不透明

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

		// (2, 2) の 8 近傍すべてが赤になるはずである
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
		// (0, 0) に不透明ピクセルがある 2x2 画像
		// 4x4 に拡張後、元のピクセルは (1, 1)
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

		check(1, 1, [0, 0, 0, 255]); // 元の (0,0) は (1,1) へ移動
		check(2, 1, red); // 右の近傍
		check(1, 2, red); // 下の近傍
		check(0, 1, red); // 左の近傍（拡張によって新たに可能）
		check(1, 0, red); // 上の近傍（拡張によって新たに可能）
	});
});
