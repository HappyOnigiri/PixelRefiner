import {
	BATCH_PALETTE_DEFAULTS,
	clampInt,
	PROCESS_RANGES,
} from "../shared/config";
import type { DitherMode, RawImage, RGB } from "../shared/types";
import { applyColorReduction } from "./color-reduction";
import { OklabKMeans } from "./oklab-kmeans";
import type { WeightedPaletteColor } from "./weighted-colors";

export const createSharedPalette = (
	images: readonly RawImage[],
	requestedColorCount: number,
): RGB[] => {
	const weights = new Map<number, WeightedPaletteColor>();
	for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
		const image = images[imageIndex];
		const imageColors = new Map<number, number>();
		let opaquePixels = 0;
		const pixelCount = image.data.length / 4;
		const sampleCount = Math.min(
			pixelCount,
			BATCH_PALETTE_DEFAULTS.maxSamplesPerImage,
		);
		// [Policy] 写真入力でも一意色オブジェクトが無制限に増えないよう、
		// 先頭と末尾を含む等間隔サンプルだけをパレット生成へ使う。
		for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
			const pixelIndex =
				sampleCount === pixelCount || sampleCount === 1
					? sampleIndex
					: Math.floor((sampleIndex * (pixelCount - 1)) / (sampleCount - 1));
			const offset = pixelIndex * 4;
			if (image.data[offset + 3] === 0) continue;
			opaquePixels += 1;
			const r = image.data[offset];
			const g = image.data[offset + 1];
			const b = image.data[offset + 2];
			const key = (r << 16) | (g << 8) | b;
			const existing = imageColors.get(key);
			imageColors.set(key, existing === undefined ? 1 : existing + 1);
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
			const [key, count] = sortedColors[colorIndex];
			const weight =
				BATCH_PALETTE_DEFAULTS.frequencyWeight * (count / opaquePixels) +
				uniformWeight;
			const existing = weights.get(key);
			if (existing) existing.weight += weight;
			else {
				weights.set(key, {
					r: (key >> 16) & 0xff,
					g: (key >> 8) & 0xff,
					b: key & 0xff,
					weight,
				});
			}
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
