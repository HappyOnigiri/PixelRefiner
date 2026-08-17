import type { DitherMode, Oklab, PixelData, RGB } from "../shared/types";
import { rgbToOklab } from "./colorUtils";
import { applyPaletteDithering, quantizeToPalette } from "./palette-dithering";

/** Oklab 距離を用いた固定パレットの量子化。 */
export class PaletteQuantizer {
	private paletteLabs: Oklab[];

	constructor(private palette: RGB[]) {
		this.paletteLabs = palette.map((rgb) => rgbToOklab(rgb));
	}

	quantize(pixels: PixelData[]): PixelData[] {
		return quantizeToPalette(pixels, this.palette, (red, green, blue) =>
			this.findClosestPaletteIndex(red, green, blue),
		);
	}

	/** 各種モードでディザリングを適用する。 */
	applyDithering(
		pixels: PixelData[],
		width: number,
		height: number,
		mode: DitherMode,
		strength = 1.0,
	): PixelData[] {
		return applyPaletteDithering(
			pixels,
			width,
			height,
			mode,
			strength,
			this.palette,
			(red, green, blue) => this.findClosestPaletteIndex(red, green, blue),
		);
	}

	private findClosestPaletteIndex(
		red: number,
		green: number,
		blue: number,
	): number {
		const lab = rgbToOklab({ r: red, g: green, b: blue });
		let minimumDistance = Number.MAX_VALUE;
		let bestIndex = 0;

		for (let index = 0; index < this.paletteLabs.length; index += 1) {
			const targetLab = this.paletteLabs[index];
			const targetRgb = this.palette[index];
			let distance = this.colorDistanceSq(lab, targetLab);

			// [Intended] 非常に暗い入力だけ黒を優先し、暗色パレットへの誤分類を防ぐ。
			if (
				targetRgb.r === 0 &&
				targetRgb.g === 0 &&
				targetRgb.b === 0 &&
				lab.L < 0.2
			) {
				const luminanceBias = (0.2 - lab.L) * 1.5;
				distance -= luminanceBias * luminanceBias;
			}

			if (lab.L < 0.1) {
				const deltaRed = (red - targetRgb.r) / 255;
				const deltaGreen = (green - targetRgb.g) / 255;
				const deltaBlue = (blue - targetRgb.b) / 255;
				const rgbDistance =
					deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue;
				distance += rgbDistance * (0.5 - lab.L);
			}

			if (distance < minimumDistance) {
				minimumDistance = distance;
				bestIndex = index;
			}
		}

		return bestIndex;
	}

	private colorDistanceSq(left: Oklab, right: Oklab): number {
		const deltaL = left.L - right.L;
		const deltaA = left.a - right.a;
		const deltaB = left.b - right.b;
		return deltaL * deltaL + deltaA * deltaA + deltaB * deltaB;
	}
}
