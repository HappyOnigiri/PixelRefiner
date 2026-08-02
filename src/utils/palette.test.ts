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
				{ r: 255, g: 255, b: 255 }, // 白
				{ r: 0, g: 0, b: 0 }, // 黒
				{ r: 255, g: 0, b: 0 }, // 赤
				{ r: 0, g: 255, b: 0 }, // 緑
				{ r: 0, g: 0, b: 255 }, // 青
			];
			// 輝度（Rec 601）:
			// 白: 255
			// 緑: 約 150
			// 赤: 約 76
			// 青: 約 29
			// 黒: 0
			// 期待値: 白、緑、赤、青、黒
			const sorted = sortPalette(palette);
			expect(sorted[0]).toEqual({ r: 255, g: 255, b: 255 });
			expect(sorted[1]).toEqual({ r: 0, g: 255, b: 0 });
			expect(sorted[2]).toEqual({ r: 255, g: 0, b: 0 });
			expect(sorted[3]).toEqual({ r: 0, g: 0, b: 255 });
			expect(sorted[4]).toEqual({ r: 0, g: 0, b: 0 });
		});

		it("should handle mixed brightness", () => {
			const palette: RGB[] = [
				{ r: 50, g: 50, b: 50 }, // 濃い灰色
				{ r: 200, g: 200, b: 200 }, // 薄い灰色
			];
			const sorted = sortPalette(palette);
			expect(sorted[0]).toEqual({ r: 200, g: 200, b: 200 });
			expect(sorted[1]).toEqual({ r: 50, g: 50, b: 50 });
		});
	});
});

describe("extractColorsFromImage", () => {
	/**
	 * テスト用の ImageData を作成するヘルパー関数
	 * @param width - 画像の幅
	 * @param height - 画像の高さ
	 * @param pixels - [r, g, b] または [r, g, b, a] タプルの配列
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
			[255, 0, 0], // 赤
			[0, 255, 0], // 緑
			[255, 0, 0], // 赤（重複）
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(2);
		expect(colors).toHaveLength(2);
		expect(colors).toContainEqual({ r: 255, g: 0, b: 0 });
		expect(colors).toContainEqual({ r: 0, g: 255, b: 0 });
	});

	it("should skip transparent pixels", () => {
		const imageData = createImageData(3, 1, [
			[255, 0, 0, 255], // 赤（不透明）
			[0, 255, 0, 100], // 緑（半透明、< 128）
			[0, 0, 255, 128], // 青（しきい値上のため含める）
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(2);
		expect(colors).toContainEqual({ r: 255, g: 0, b: 0 });
		expect(colors).toContainEqual({ r: 0, g: 0, b: 255 });
		expect(colors).not.toContainEqual({ r: 0, g: 255, b: 0 });
	});

	it("should limit colors to maxColors using median cut", () => {
		const imageData = createImageData(5, 1, [
			[255, 255, 255], // 白（最も明るい）
			[0, 0, 0], // 黒（最も暗い）
			[255, 0, 0], // 赤
			[0, 255, 0], // 緑
			[0, 0, 255], // 青
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData, 3);
		expect(totalColors).toBe(5);
		expect(colors).toHaveLength(3);
		// 中央値分割法は色空間から多様な色を選択する必要がある
		// 正確な色はアルゴリズムに依存するが、多様であり、
		// 表示用に輝度順で並んでいる必要がある
	});

	it("should select diverse colors when limiting", () => {
		const imageData = createImageData(6, 1, [
			[255, 0, 0], // 赤
			[255, 50, 50], // 薄い赤
			[255, 100, 100], // さらに薄い赤
			[0, 0, 255], // 青
			[50, 50, 255], // 薄い青
			[100, 100, 255], // さらに薄い青
		]);

		const { colors, totalColors } = extractColorsFromImage(imageData, 2);
		expect(totalColors).toBe(6);
		expect(colors).toHaveLength(2);
		// 赤と青のグループから代表色を選択する必要がある
		// 正確な値は各グループの平均値で、輝度順に並ぶ
	});

	it("should handle empty image", () => {
		const imageData = createImageData(0, 0, []);
		const { colors, totalColors } = extractColorsFromImage(imageData);
		expect(totalColors).toBe(0);
		expect(colors).toHaveLength(0);
	});

	it("should handle fully transparent image", () => {
		const imageData = createImageData(2, 1, [
			[255, 0, 0, 0], // 透明な赤
			[0, 255, 0, 50], // 透明な緑
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
