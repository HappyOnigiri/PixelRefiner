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
			it(`${name} が正しく変換・逆変換（ラウンドトリップ）できること`, () => {
				const lab = rgbToOklab(rgb);
				const backRgb = oklabToRgb(lab);

				// 許容誤差 ±1 以内であることを確認
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
		it("結果が 0-255 の範囲にクリッピングされていること", () => {
			// 非常に大きなL値を持つOklab（白を超えるはず）
			const brightLab = { L: 2.0, a: 0, b: 0 };
			const rgb = oklabToRgb(brightLab);
			expect(rgb.r).toBe(255);
			expect(rgb.g).toBe(255);
			expect(rgb.b).toBe(255);

			// 非常に小さなL値を持つOklab（黒を下回るはず）
			const darkLab = { L: -1.0, a: 0, b: 0 };
			const darkRgb = oklabToRgb(darkLab);
			expect(darkRgb.r).toBe(0);
			expect(darkRgb.g).toBe(0);
			expect(darkRgb.b).toBe(0);
		});
	});
});
