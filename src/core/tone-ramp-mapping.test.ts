import { describe, expect, it } from "vitest";
import { RETRO_PALETTES } from "../shared/config";
import type { PixelData, RGB } from "../shared/types";
import { rgbToOklab } from "./colorUtils";
import { PaletteQuantizer } from "./quantizer";
import {
	alignPixelsToToneRamp,
	isToneRampPalette,
	resolveToneRampMapping,
} from "./tone-ramp-mapping";

const hexToRgb = (hex: string): RGB => ({
	r: parseInt(hex.slice(1, 3), 16),
	g: parseInt(hex.slice(3, 5), 16),
	b: parseInt(hex.slice(5, 7), 16),
});

const paletteOf = (key: string): RGB[] =>
	RETRO_PALETTES[key].colors.map(hexToRgb);

const px = (r: number, g: number, b: number, alpha = 255): PixelData => ({
	r,
	g,
	b,
	alpha,
});

/** 各色を count 個ずつ並べた画素列を作る。 */
const repeat = (colors: RGB[], count: number): PixelData[] =>
	colors.flatMap((color) =>
		Array.from({ length: count }, () => px(color.r, color.g, color.b)),
	);

describe("tone-ramp-mapping.ts", () => {
	describe("isToneRampPalette", () => {
		it.each(["gb_pocket", "mono", "gb_legacy", "gb_light"])(
			"treats %s as a tone ramp",
			(key) => {
				expect(isToneRampPalette(paletteOf(key))).toBe(true);
			},
		);

		it.each(["pico8", "nes", "pc98", "msx", "c64", "arne16"])(
			"excludes the multi-hue palette %s",
			(key) => {
				expect(isToneRampPalette(paletteOf(key))).toBe(false);
			},
		);

		it("excludes palettes whose levels share the same lightness", () => {
			expect(
				isToneRampPalette([
					{ r: 84, g: 84, b: 84 },
					{ r: 85, g: 85, b: 85 },
				]),
			).toBe(false);
		});

		it("excludes palettes with a single color", () => {
			expect(isToneRampPalette([{ r: 0, g: 0, b: 0 }])).toBe(false);
		});

		it("excludes a palette that holds only one chromatic color", () => {
			expect(
				isToneRampPalette([
					{ r: 0, g: 0, b: 0 },
					{ r: 255, g: 0, b: 0 },
				]),
			).toBe(false);
		});

		it("accepts a ramp built from several colors of one hue", () => {
			expect(
				isToneRampPalette([
					{ r: 0, g: 0, b: 0 },
					{ r: 96, g: 16, b: 16 },
					{ r: 180, g: 40, b: 40 },
					{ r: 255, g: 128, b: 128 },
				]),
			).toBe(true);
		});
	});

	describe("resolveToneRampMapping", () => {
		const pocket = paletteOf("gb_pocket");

		it("maps the darkest input grade onto the darkest palette color", () => {
			// 濃い緑の縁と、明るさの異なる 3 段の緑。gb_pocket の 4 段に対応させる。
			const pixels = repeat(
				[
					{ r: 5, g: 37, b: 24 },
					{ r: 55, g: 102, b: 60 },
					{ r: 132, g: 183, b: 97 },
					{ r: 206, g: 245, b: 193 },
				],
				8,
			);
			const mapping = resolveToneRampMapping(pixels, pocket);
			expect(mapping).toBeDefined();
			if (!mapping) return;
			expect(mapping.source).toHaveLength(4);
			expect(mapping.target[0]).toBeCloseTo(0, 5);
			expect(mapping.target[3]).toBeCloseTo(1, 5);
			// 入力の各階調が昇順のまま対応している
			for (let i = 1; i < mapping.source.length; i++) {
				expect(mapping.source[i]).toBeGreaterThan(mapping.source[i - 1]);
			}
		});

		it("falls back to matching only both ends when grades are fewer than palette levels", () => {
			const pixels = repeat(
				[
					{ r: 5, g: 37, b: 24 },
					{ r: 206, g: 245, b: 193 },
				],
				16,
			);
			const mapping = resolveToneRampMapping(pixels, pocket);
			expect(mapping).toBeDefined();
			expect(mapping?.source).toHaveLength(2);
			expect(mapping?.target[0]).toBeCloseTo(0, 5);
			expect(mapping?.target[1]).toBeCloseTo(1, 5);
		});

		it("returns undefined for a multi-hue palette", () => {
			const pixels = repeat([{ r: 5, g: 37, b: 24 }], 64);
			expect(
				resolveToneRampMapping(pixels, paletteOf("pico8")),
			).toBeUndefined();
		});

		it("returns undefined for a continuous-tone input", () => {
			// なめらかなグラデーションは階調が分かれていないので順序対応の対象外。
			const pixels = Array.from({ length: 256 }, (_, index) =>
				px(index, index, index),
			);
			expect(resolveToneRampMapping(pixels, pocket)).toBeUndefined();
		});

		it("returns undefined for a flat input", () => {
			const pixels = repeat([{ r: 40, g: 40, b: 40 }], 64);
			expect(resolveToneRampMapping(pixels, pocket)).toBeUndefined();
		});

		it("returns undefined when there are too few opaque pixels", () => {
			const pixels = [px(5, 37, 24), px(206, 245, 193), px(0, 0, 0, 0)];
			expect(resolveToneRampMapping(pixels, pocket)).toBeUndefined();
		});

		it("ignores transparent pixels when measuring grades", () => {
			const opaque = repeat(
				[
					{ r: 5, g: 37, b: 24 },
					{ r: 55, g: 102, b: 60 },
					{ r: 132, g: 183, b: 97 },
					{ r: 206, g: 245, b: 193 },
				],
				8,
			);
			const withTransparent = [
				...opaque,
				...Array.from({ length: 32 }, () => px(255, 0, 0, 0)),
			];
			expect(resolveToneRampMapping(withTransparent, pocket)).toEqual(
				resolveToneRampMapping(opaque, pocket),
			);
		});
	});

	describe("alignPixelsToToneRamp", () => {
		it("quantizes each input grade onto its own palette level in order", () => {
			const pocket = paletteOf("gb_pocket");
			const grades = [
				{ r: 5, g: 37, b: 24 },
				{ r: 55, g: 102, b: 60 },
				{ r: 132, g: 183, b: 97 },
				{ r: 206, g: 245, b: 193 },
			];
			const pixels = repeat(grades, 8);
			const quantizer = new PaletteQuantizer(pocket);

			// 揃える前は暗い 2 段がどちらも #545454 に潰れ、最暗色に届かない。
			const before = quantizer.quantize(pixels);
			expect(before[0]).toMatchObject({ r: 84, g: 84, b: 84 });
			expect(before[8]).toMatchObject({ r: 84, g: 84, b: 84 });

			const after = quantizer.quantize(alignPixelsToToneRamp(pixels, pocket));
			expect(after[0]).toMatchObject({ r: 0, g: 0, b: 0 });
			expect(after[8]).toMatchObject({ r: 84, g: 84, b: 84 });
			expect(after[16]).toMatchObject({ r: 168, g: 168, b: 168 });
			expect(after[24]).toMatchObject({ r: 255, g: 255, b: 255 });
		});

		it("keeps hue while moving lightness", () => {
			const legacy = paletteOf("gb_legacy");
			const pixels = repeat(
				[
					{ r: 5, g: 37, b: 24 },
					{ r: 55, g: 102, b: 60 },
					{ r: 132, g: 183, b: 97 },
					{ r: 206, g: 245, b: 193 },
				],
				8,
			);
			const aligned = alignPixelsToToneRamp(pixels, legacy);
			const before = rgbToOklab(pixels[0]);
			const after = rgbToOklab(aligned[0]);
			const dot = before.a * after.a + before.b * after.b;
			expect(dot).toBeGreaterThan(0);
		});

		it("returns the input untouched for a multi-hue palette", () => {
			const pixels = repeat(
				[
					{ r: 5, g: 37, b: 24 },
					{ r: 206, g: 245, b: 193 },
				],
				16,
			);
			expect(alignPixelsToToneRamp(pixels, paletteOf("nes"))).toBe(pixels);
		});

		it("leaves transparent pixels as they are", () => {
			const pocket = paletteOf("gb_pocket");
			const pixels = [
				...repeat(
					[
						{ r: 5, g: 37, b: 24 },
						{ r: 55, g: 102, b: 60 },
						{ r: 132, g: 183, b: 97 },
						{ r: 206, g: 245, b: 193 },
					],
					8,
				),
				px(255, 0, 0, 0),
			];
			const aligned = alignPixelsToToneRamp(pixels, pocket);
			expect(aligned[aligned.length - 1]).toEqual(px(255, 0, 0, 0));
		});
	});
});
