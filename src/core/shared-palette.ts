import {
	BATCH_PALETTE_DEFAULTS,
	clampInt,
	PROCESS_RANGES,
} from "../shared/config";
import type { DitherMode, RawImage, RGB } from "../shared/types";
import { applyColorReduction } from "./color-reduction";
import { OklabKMeans } from "./oklab-kmeans";
import type { WeightedPaletteColor } from "./weighted-colors";

type ColorCount = {
	r: number;
	g: number;
	b: number;
	count: number;
};

export const createSharedPalette = (
	images: readonly RawImage[],
	requestedColorCount: number,
): RGB[] => {
	const weights = new Map<number, WeightedPaletteColor>();
	for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
		const image = images[imageIndex];
		const imageColors = new Map<number, ColorCount>();
		let opaquePixels = 0;
		for (let offset = 0; offset < image.data.length; offset += 4) {
			if (image.data[offset + 3] === 0) continue;
			opaquePixels += 1;
			const r = image.data[offset];
			const g = image.data[offset + 1];
			const b = image.data[offset + 2];
			const key = (r << 16) | (g << 8) | b;
			const existing = imageColors.get(key);
			if (existing) existing.count += 1;
			else imageColors.set(key, { r, g, b, count: 1 });
		}
		if (opaquePixels === 0 || imageColors.size === 0) continue;

		const uniformWeight =
			BATCH_PALETTE_DEFAULTS.uniformColorWeight / imageColors.size;
		const sortedColors = Array.from(imageColors.entries()).sort(
			(left, right) => left[0] - right[0],
		);
		for (
			let colorIndex = 0;
			colorIndex < sortedColors.length;
			colorIndex += 1
		) {
			const [key, color] = sortedColors[colorIndex];
			const weight =
				BATCH_PALETTE_DEFAULTS.frequencyWeight * (color.count / opaquePixels) +
				uniformWeight;
			const existing = weights.get(key);
			if (existing) existing.weight += weight;
			else weights.set(key, { r: color.r, g: color.g, b: color.b, weight });
		}
	}

	if (weights.size === 0) return [];
	const colorCount = clampInt(requestedColorCount, PROCESS_RANGES.colorCount);
	const colors = Array.from(weights.values()).sort(
		(left, right) =>
			((left.r << 16) | (left.g << 8) | left.b) -
			((right.r << 16) | (right.g << 8) | right.b),
	);
	return new OklabKMeans(colorCount).createPalette(colors);
};

export const applySharedPalette = (
	image: RawImage,
	palette: readonly RGB[],
	ditherMode: DitherMode,
	ditherStrength: number,
): RawImage => {
	if (palette.length === 0) return image;
	return applyColorReduction(
		image,
		"fixed",
		ditherMode,
		palette.length,
		ditherStrength,
		() => undefined,
		[...palette],
	);
};
