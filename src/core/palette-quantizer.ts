import type { DitherMode, Oklab, PixelData, RGB } from "../shared/types";
import { rgbToOklab } from "./colorUtils";
import { getDitherMatrix } from "./dither-matrix";

/**
 * Oklab 距離を用いた固定パレットの量子化
 */
export class PaletteQuantizer {
	private paletteLabs: Oklab[];

	constructor(private palette: RGB[]) {
		this.paletteLabs = palette.map((rgb) => rgbToOklab(rgb));
	}

	quantize(pixels: PixelData[]): PixelData[] {
		const memo = new Map<number, number>(); // RGB キー -> パレットのインデックス

		return pixels.map((p) => {
			if (p.alpha === 0) return p;
			const key = (p.r << 16) | (p.g << 8) | p.b;

			let paletteIdx = memo.get(key);
			if (paletteIdx === undefined) {
				const lab = rgbToOklab(p);
				let minDist = Number.MAX_VALUE;
				paletteIdx = 0;

				for (let i = 0; i < this.paletteLabs.length; i++) {
					const targetLab = this.paletteLabs[i];
					const targetRgb = this.palette[i];

					// Oklab 距離
					let dist = this.colorDistanceSq(lab, targetLab);

					// 暗いピクセルが茶色などの暗色へ引っ張られるのを防ぐため、
					// 純粋な黒（L=0）の判定にバイアスをかけるか、RGB 距離を補助的に使用する。
					// 特に NES の黒（#000000）と茶色（#503000）の誤分類を防ぐ。
					const isTargetBlack =
						targetRgb.r === 0 && targetRgb.g === 0 && targetRgb.b === 0;

					if (isTargetBlack) {
						// バイアスはおよそ L=0.2 未満（sRGB でおよそ 45〜50）の非常に暗いピクセルにのみ適用する。
						// これにより、ゲームボーイなどのパレットにある「濃いグレー」が黒と判定されるのを防ぐ。
						if (lab.L < 0.2) {
							const lBias = (0.2 - lab.L) * 1.5;
							dist -= lBias * lBias;
						}
					}

					// RGB 空間の距離も補助的に使用する（非常に暗い色のみ）。
					if (lab.L < 0.1) {
						const dR = (p.r - targetRgb.r) / 255;
						const dG = (p.g - targetRgb.g) / 255;
						const dB = (p.b - targetRgb.b) / 255;
						const rgbDistSq = dR * dR + dG * dG + dB * dB;
						const rgbWeight = 0.5 - lab.L;
						dist += rgbDistSq * rgbWeight;
					}

					if (dist < minDist) {
						minDist = dist;
						paletteIdx = i;
					}
				}
				memo.set(key, paletteIdx);
			}

			const rgb = this.palette[paletteIdx];
			return { ...rgb, alpha: p.alpha };
		});
	}

	/**
	 * 固定パレットを使用する Floyd-Steinberg ディザリング
	 */
	dither(
		pixels: PixelData[],
		width: number,
		height: number,
		strength = 1.0,
	): PixelData[] {
		return this.applyDithering(
			pixels,
			width,
			height,
			"floyd-steinberg",
			strength,
		);
	}

	/**
	 * 各種モードでディザリングを適用する
	 */
	applyDithering(
		pixels: PixelData[],
		width: number,
		height: number,
		mode: DitherMode,
		strength = 1.0,
	): PixelData[] {
		if (mode === "none" || strength <= 0) {
			return this.quantize(pixels);
		}

		if (mode === "floyd-steinberg") {
			return this.applyFloydSteinberg(pixels, width, height, strength);
		}

		return this.applyOrderedDithering(pixels, width, height, mode, strength);
	}

	private applyFloydSteinberg(
		pixels: PixelData[],
		width: number,
		height: number,
		strength: number,
	): PixelData[] {
		const out = pixels.map((p) => ({ ...p }));

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				const p = out[idx];
				if (p.alpha === 0) continue;

				const lab = rgbToOklab(p);
				let minDist = Number.MAX_VALUE;
				let bestIdx = 0;

				for (let i = 0; i < this.paletteLabs.length; i++) {
					const targetLab = this.paletteLabs[i];
					const targetRgb = this.palette[i];

					let dist = this.colorDistanceSq(lab, targetLab);

					const isTargetBlack =
						targetRgb.r === 0 && targetRgb.g === 0 && targetRgb.b === 0;
					if (isTargetBlack) {
						if (lab.L < 0.2) {
							const lBias = (0.2 - lab.L) * 1.5;
							dist -= lBias * lBias;
						}
					}

					if (lab.L < 0.1) {
						const dR = (p.r - targetRgb.r) / 255;
						const dG = (p.g - targetRgb.g) / 255;
						const dB = (p.b - targetRgb.b) / 255;
						const rgbDistSq = dR * dR + dG * dG + dB * dB;
						const rgbWeight = 0.5 - lab.L;
						dist += rgbDistSq * rgbWeight;
					}

					if (dist < minDist) {
						minDist = dist;
						bestIdx = i;
					}
				}

				const closest = this.palette[bestIdx];
				const errR = (p.r - closest.r) * strength;
				const errG = (p.g - closest.g) * strength;
				const errB = (p.b - closest.b) * strength;

				out[idx].r = closest.r;
				out[idx].g = closest.g;
				out[idx].b = closest.b;

				// 誤差を分配する
				this.distributeError(
					out,
					x + 1,
					y,
					width,
					height,
					errR,
					errG,
					errB,
					7 / 16,
				);
				this.distributeError(
					out,
					x - 1,
					y + 1,
					width,
					height,
					errR,
					errG,
					errB,
					3 / 16,
				);
				this.distributeError(
					out,
					x,
					y + 1,
					width,
					height,
					errR,
					errG,
					errB,
					5 / 16,
				);
				this.distributeError(
					out,
					x + 1,
					y + 1,
					width,
					height,
					errR,
					errG,
					errB,
					1 / 16,
				);
			}
		}

		return out;
	}

	private applyOrderedDithering(
		pixels: PixelData[],
		width: number,
		height: number,
		mode: DitherMode,
		strength: number,
	): PixelData[] {
		const matrix = getDitherMatrix(mode);
		const size = Math.sqrt(matrix.length);
		const out = new Array<PixelData>(pixels.length);

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const idx = y * width + x;
				const p = pixels[idx];
				if (p.alpha === 0) {
					out[idx] = p;
					continue;
				}

				const threshold = matrix[(y % size) * size + (x % size)];
				const bias = (threshold - 0.5) * strength * 255;

				const biasedR = Math.max(0, Math.min(255, p.r + bias));
				const biasedG = Math.max(0, Math.min(255, p.g + bias));
				const biasedB = Math.max(0, Math.min(255, p.b + bias));

				const lab = rgbToOklab({
					r: biasedR,
					g: biasedG,
					b: biasedB,
				});
				let minDist = Number.MAX_VALUE;
				let bestIdx = 0;

				for (let i = 0; i < this.paletteLabs.length; i++) {
					const targetLab = this.paletteLabs[i];
					const targetRgb = this.palette[i];

					let dist = this.colorDistanceSq(lab, targetLab);

					const isTargetBlack =
						targetRgb.r === 0 && targetRgb.g === 0 && targetRgb.b === 0;
					if (isTargetBlack) {
						if (lab.L < 0.2) {
							const lBias = (0.2 - lab.L) * 1.5;
							dist -= lBias * lBias;
						}
					}

					if (lab.L < 0.1) {
						const dR = (biasedR - targetRgb.r) / 255;
						const dG = (biasedG - targetRgb.g) / 255;
						const dB = (biasedB - targetRgb.b) / 255;
						const rgbDistSq = dR * dR + dG * dG + dB * dB;
						const rgbWeight = 0.5 - lab.L;
						dist += rgbDistSq * rgbWeight;
					}

					if (dist < minDist) {
						minDist = dist;
						bestIdx = i;
					}
				}

				const closest = this.palette[bestIdx];
				out[idx] = { ...closest, alpha: p.alpha };
			}
		}

		return out;
	}

	private distributeError(
		pixels: PixelData[],
		x: number,
		y: number,
		width: number,
		height: number,
		errR: number,
		errG: number,
		errB: number,
		weight: number,
	): void {
		if (x < 0 || x >= width || y < 0 || y >= height) return;
		const idx = y * width + x;
		const p = pixels[idx];
		if (p.alpha === 0) return;

		p.r = Math.max(0, Math.min(255, p.r + errR * weight));
		p.g = Math.max(0, Math.min(255, p.g + errG * weight));
		p.b = Math.max(0, Math.min(255, p.b + errB * weight));
	}

	private colorDistanceSq(c1: Oklab, c2: Oklab): number {
		const dL = c1.L - c2.L;
		const da = c1.a - c2.a;
		const db = c1.b - c2.b;
		return dL * dL + da * da + db * db;
	}
}
