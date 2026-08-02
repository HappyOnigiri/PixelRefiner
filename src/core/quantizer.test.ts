import { describe, expect, it } from "vitest";
import type { PixelData } from "../shared/types";
import { OklabKMeans, PaletteQuantizer } from "./quantizer";

// PixelData 生成ヘルパー
const px = (r: number, g: number, b: number, a = 255): PixelData => ({
	r,
	g,
	b,
	alpha: a,
});

describe("quantizer.ts", () => {
	describe("OklabKMeans", () => {
		const deterministicInput = Array.from({ length: 64 }, (_, index) =>
			px(
				(index * 47) % 256,
				(index * 83 + 29) % 256,
				(index * 131 + 71) % 256,
				index % 7 === 0 ? 0 : 255,
			),
		);

		it.each([
			["none", 0],
			["floyd-steinberg", 1],
			["bayer-4x4", 1],
			["ordered", 1],
		] as const)(
			"returns identical RGBA bytes and palette order over 20 %s runs",
			(mode, strength) => {
				const runs = Array.from({ length: 20 }, () =>
					new OklabKMeans(8).applyDithering(
						deterministicInput,
						8,
						8,
						mode,
						strength,
					),
				);
				const rgba = (pixels: PixelData[]) =>
					pixels.flatMap((pixel) => [pixel.r, pixel.g, pixel.b, pixel.alpha]);
				const paletteOrder = (pixels: PixelData[]) => [
					...new Set(
						pixels
							.filter((pixel) => pixel.alpha > 0)
							.map((pixel) => `${pixel.r},${pixel.g},${pixel.b}`),
					),
				];

				expect(paletteOrder(runs[0])).toHaveLength(8);
				for (let i = 1; i < runs.length; i++) {
					expect(rgba(runs[i])).toEqual(rgba(runs[0]));
					expect(paletteOrder(runs[i])).toEqual(paletteOrder(runs[0]));
				}
			},
		);

		it("does not depend on Math.random for initialization or recovery", () => {
			const originalRandom = Math.random;
			Math.random = () => {
				throw new Error("randomness is not allowed");
			};
			try {
				expect(() =>
					new OklabKMeans(8).quantize(deterministicInput),
				).not.toThrow();
			} finally {
				Math.random = originalRandom;
			}
		});

		it("keeps each image stable when batch order changes", () => {
			const inputs = [
				deterministicInput,
				deterministicInput.map((pixel, index) => ({
					...pixel,
					r: (pixel.r + index * 11) % 256,
				})),
			];
			const process = (input: PixelData[]) =>
				new OklabKMeans(6).applyDithering(input, 8, 8, "floyd-steinberg", 1);
			const forward = inputs.map(process);
			const reversed = [...inputs].reverse().map(process).reverse();

			expect(reversed).toEqual(forward);
		});

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
			// 透明ピクセルの色情報は維持されるか、変更されても alpha は 0 のままである
		});
	});

	describe("OklabKMeans Edge Cases", () => {
		it("should not crash when input color count is less than specified count", () => {
			const q = new OklabKMeans(16); // 16 色に削減する
			const input = [
				px(255, 0, 0), // 赤
				px(0, 0, 255), // 青
				px(255, 0, 0), // 赤
			];

			// エラーなく返る
			expect(() => q.quantize(input)).not.toThrow();
			const result = q.quantize(input);

			// 色は同じまま（または 2 色以内）
			const uniqueColors = new Set(result.map((p) => `${p.r},${p.g},${p.b}`));
			expect(uniqueColors.size).toBeLessThanOrEqual(2);
		});

		it("should not let Alpha=0 pixels affect centroid calculation", () => {
			const q = new OklabKMeans(1);
			const input = [
				px(255, 0, 0, 255), // 赤（不透明）
				px(0, 255, 0, 0), // 緑（透明）
				px(0, 255, 0, 0), // 緑（透明）
				px(0, 255, 0, 0), // 緑（透明）
			];

			const result = q.quantize(input);
			// 1 色に削減する場合、不透明な「赤」が選ばれるはずである。
			// 透明な「緑」を計算に含めると、色が混ざってしまう。
			expect(result[0].r).toBeGreaterThan(200);
			expect(result[0].g).toBeLessThan(50);
		});
	});

	describe("PaletteQuantizer", () => {
		it("should snap to the nearest palette color", () => {
			const palette = [px(255, 255, 255), px(0, 0, 0)];
			const q = new PaletteQuantizer(palette);
			const input = [px(128, 128, 128)]; // グレー
			const result = q.quantize(input);

			// 128,128,128 は Oklab 距離では 0,0,0 または 255,255,255 のいずれかにスナップするはずである
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
			// しきい値により異なるパレット色が割り当てられるはずである
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
