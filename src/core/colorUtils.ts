import type { Oklab, RGB } from "../shared/types";

/**
 * sRGB (0-255) to Linear RGB (0.0-1.0)
 */
function srgbToLinear(c: number): number {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * Linear RGB (0.0-1.0) to sRGB (0-255)
 */
function linearToSrgb(c: number): number {
	const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/**
 * RGB to Oklab
 */
export function rgbToOklab(rgb: RGB): Oklab {
	const r = srgbToLinear(rgb.r);
	const g = srgbToLinear(rgb.g);
	const b = srgbToLinear(rgb.b);

	const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
	const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
	const s = 0.0883024619 * r + 0.2817188501 * g + 0.6299787005 * b;

	const l_ = Math.cbrt(l);
	const m_ = Math.cbrt(m);
	const s_ = Math.cbrt(s);

	return {
		L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
		a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
		b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
	};
}

/**
 * Oklab to RGB
 */
export function oklabToRgb(lab: Oklab): RGB {
	const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
	const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
	const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	return {
		r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	};
}
