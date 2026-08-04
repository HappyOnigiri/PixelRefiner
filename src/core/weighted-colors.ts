import type { Oklab, RGB } from "../shared/types";
import { rgbToOklab } from "./colorUtils";

export type WeightedPaletteColor = RGB & {
	weight: number;
};

export type PreparedWeightedColor = {
	key: number;
	lab: Oklab;
	count: number;
};

export const prepareWeightedColors = (
	colors: readonly WeightedPaletteColor[],
): PreparedWeightedColor[] => {
	const colorMap = new Map<number, PreparedWeightedColor>();
	for (let index = 0; index < colors.length; index += 1) {
		const color = colors[index];
		if (!Number.isFinite(color.weight) || color.weight <= 0) continue;
		const r = Math.max(0, Math.min(255, Math.round(color.r)));
		const g = Math.max(0, Math.min(255, Math.round(color.g)));
		const b = Math.max(0, Math.min(255, Math.round(color.b)));
		const key = (r << 16) | (g << 8) | b;
		const existing = colorMap.get(key);
		if (existing) existing.count += color.weight;
		else {
			colorMap.set(key, {
				key,
				lab: rgbToOklab({ r, g, b }),
				count: color.weight,
			});
		}
	}
	return Array.from(colorMap.values()).sort(
		(left, right) => left.key - right.key,
	);
};
