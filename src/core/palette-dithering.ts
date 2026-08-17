import type { DitherMode, PixelData, RGB } from "../shared/types";
import { getDitherMatrix } from "./dither-matrix";

export type PaletteIndexSelector = (r: number, g: number, b: number) => number;

const FLOYD_STEINBERG_NEIGHBORS = [
	[1, 0, 7 / 16],
	[-1, 1, 3 / 16],
	[0, 1, 5 / 16],
	[1, 1, 1 / 16],
] as const;

export const quantizeToPalette = (
	pixels: PixelData[],
	palette: RGB[],
	selectPaletteIndex: PaletteIndexSelector,
): PixelData[] => {
	const memo = new Map<number, number>();
	const output = new Array<PixelData>(pixels.length);
	for (let index = 0; index < pixels.length; index += 1) {
		const pixel = pixels[index];
		if (pixel.alpha === 0) {
			output[index] = pixel;
			continue;
		}
		const key = (pixel.r << 16) | (pixel.g << 8) | pixel.b;
		let paletteIndex = memo.get(key);
		if (paletteIndex === undefined) {
			paletteIndex = selectPaletteIndex(pixel.r, pixel.g, pixel.b);
			memo.set(key, paletteIndex);
		}
		output[index] = { ...palette[paletteIndex], alpha: pixel.alpha };
	}
	return output;
};

const distributeError = (
	pixels: PixelData[],
	x: number,
	y: number,
	width: number,
	height: number,
	errorR: number,
	errorG: number,
	errorB: number,
	weight: number,
): void => {
	if (x < 0 || x >= width || y < 0 || y >= height) return;
	const pixel = pixels[y * width + x];
	if (pixel.alpha === 0) return;

	pixel.r = Math.max(0, Math.min(255, pixel.r + errorR * weight));
	pixel.g = Math.max(0, Math.min(255, pixel.g + errorG * weight));
	pixel.b = Math.max(0, Math.min(255, pixel.b + errorB * weight));
};

const applyFloydSteinberg = (
	pixels: PixelData[],
	width: number,
	height: number,
	palette: RGB[],
	selectPaletteIndex: PaletteIndexSelector,
	strength: number,
): PixelData[] => {
	const output = new Array<PixelData>(pixels.length);
	for (let index = 0; index < pixels.length; index += 1) {
		output[index] = { ...pixels[index] };
	}

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x;
			const pixel = output[index];
			if (pixel.alpha === 0) continue;

			const closest = palette[selectPaletteIndex(pixel.r, pixel.g, pixel.b)];
			const errorR = (pixel.r - closest.r) * strength;
			const errorG = (pixel.g - closest.g) * strength;
			const errorB = (pixel.b - closest.b) * strength;
			pixel.r = closest.r;
			pixel.g = closest.g;
			pixel.b = closest.b;

			for (
				let neighbor = 0;
				neighbor < FLOYD_STEINBERG_NEIGHBORS.length;
				neighbor += 1
			) {
				const [offsetX, offsetY, weight] = FLOYD_STEINBERG_NEIGHBORS[neighbor];
				distributeError(
					output,
					x + offsetX,
					y + offsetY,
					width,
					height,
					errorR,
					errorG,
					errorB,
					weight,
				);
			}
		}
	}

	return output;
};

const applyOrderedDithering = (
	pixels: PixelData[],
	width: number,
	height: number,
	palette: RGB[],
	selectPaletteIndex: PaletteIndexSelector,
	mode: DitherMode,
	strength: number,
): PixelData[] => {
	const matrix = getDitherMatrix(mode);
	const size = Math.sqrt(matrix.length);
	const output = new Array<PixelData>(pixels.length);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x;
			const pixel = pixels[index];
			if (pixel.alpha === 0) {
				output[index] = pixel;
				continue;
			}

			const threshold = matrix[(y % size) * size + (x % size)];
			const bias = (threshold - 0.5) * strength * 255;
			const red = Math.max(0, Math.min(255, pixel.r + bias));
			const green = Math.max(0, Math.min(255, pixel.g + bias));
			const blue = Math.max(0, Math.min(255, pixel.b + bias));
			const closest = palette[selectPaletteIndex(red, green, blue)];
			output[index] = { ...closest, alpha: pixel.alpha };
		}
	}

	return output;
};

export const applyPaletteDithering = (
	pixels: PixelData[],
	width: number,
	height: number,
	mode: DitherMode,
	strength: number,
	palette: RGB[],
	selectPaletteIndex: PaletteIndexSelector,
): PixelData[] => {
	if (mode === "none" || strength <= 0) {
		return quantizeToPalette(pixels, palette, selectPaletteIndex);
	}
	if (mode === "floyd-steinberg") {
		return applyFloydSteinberg(
			pixels,
			width,
			height,
			palette,
			selectPaletteIndex,
			strength,
		);
	}
	return applyOrderedDithering(
		pixels,
		width,
		height,
		palette,
		selectPaletteIndex,
		mode,
		strength,
	);
};
