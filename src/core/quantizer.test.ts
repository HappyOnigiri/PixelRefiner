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
});
