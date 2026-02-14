import { describe, expect, it } from "vitest";
import type { PixelData } from "../shared/types";
import { OklabKMeans, PaletteQuantizer } from "./quantizer";

// PixelData生成ヘルパー
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
			// 透明ピクセルの色情報は維持されるか、あるいは変更されても alpha は 0 のまま
		});
	});

	describe("OklabKMeans Edge Cases", () => {
		it("入力色数が指定色数より少ない場合でもクラッシュしない", () => {
			const q = new OklabKMeans(16); // 16色に減色したい
			const input = [
				px(255, 0, 0), // 赤
				px(0, 0, 255), // 青
				px(255, 0, 0), // 赤
			];

			// エラーにならず戻ってくること
			expect(() => q.quantize(input)).not.toThrow();
			const result = q.quantize(input);

			// 色が変わっていないこと（あるいは2色以内に収まっていること）
			const uniqueColors = new Set(result.map((p) => `${p.r},${p.g},${p.b}`));
			expect(uniqueColors.size).toBeLessThanOrEqual(2);
		});

		it("Alpha=0 のピクセルが重心計算に影響を与えないこと", () => {
			const q = new OklabKMeans(1);
			const input = [
				px(255, 0, 0, 255), // 赤 (不透明)
				px(0, 255, 0, 0), // 緑 (透明)
				px(0, 255, 0, 0), // 緑 (透明)
				px(0, 255, 0, 0), // 緑 (透明)
			];

			const result = q.quantize(input);
			// 1色に減色した場合、不透明な「赤」が選ばれるはず。
			// もし透明な「緑」が計算に含まれていたら、色が混ざる。
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

			// Oklab距離で 128,128,128 は 0,0,0 か 255,255,255 のどちらかに吸着するはず
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
			// 閾値によって異なるパレット色に割り振られることを期待
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
