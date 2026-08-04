import type { DitherMode, Oklab, PixelData, RGB } from "../shared/types";
import { oklabToRgb, rgbToOklab } from "./colorUtils";
import { getDitherMatrix } from "./dither-matrix";
import {
	type PreparedWeightedColor,
	prepareWeightedColors,
	type WeightedPaletteColor,
} from "./weighted-colors";

type WeightedColor = PreparedWeightedColor;

type FittedPalette = {
	rgb: RGB[];
	labs: Oklab[];
};

export class OklabKMeans {
	constructor(
		private maxColors: number,
		private maxIterations: number = 20,
		private tolerance: number = 0.001,
	) {}

	/**
	 * 既に集約された色と重みから、決定論的なパレットを生成する。
	 */
	createPalette(colors: readonly WeightedPaletteColor[]): RGB[] {
		const weighted = prepareWeightedColors(colors);
		if (weighted.length <= this.maxColors) {
			return weighted.map((color) => ({
				r: (color.key >> 16) & 255,
				g: (color.key >> 8) & 255,
				b: color.key & 255,
			}));
		}
		return this.buildUniquePalette(this.fitCentroids(weighted)).rgb;
	}

	/**
	 * K-means クラスタリングによる色削減
	 */
	quantize(pixels: PixelData[]): PixelData[] {
		const { colors: uniqueColors, opaqueCount } =
			this.collectUniqueColors(pixels);
		if (opaqueCount === 0 || this.maxColors >= opaqueCount) {
			return pixels;
		}
		if (uniqueColors.length <= this.maxColors) {
			return pixels;
		}

		const centroids = this.fitCentroids(uniqueColors);
		const fittedPalette = this.buildUniquePalette(centroids);
		const centroidRgbMap = new Map<number, number>(); // 一意の色キー -> パレットのインデックス

		for (let colorIndex = 0; colorIndex < uniqueColors.length; colorIndex++) {
			const color = uniqueColors[colorIndex];
			let minDist = Number.MAX_VALUE;
			let bestIdx = 0;
			for (let i = 0; i < fittedPalette.labs.length; i++) {
				const dist = this.colorDistanceSq(color.lab, fittedPalette.labs[i]);
				if (dist < minDist) {
					minDist = dist;
					bestIdx = i;
				}
			}
			centroidRgbMap.set(color.key, bestIdx);
		}

		return pixels.map((p) => {
			if (p.alpha === 0) return p;
			const key = (p.r << 16) | (p.g << 8) | p.b;
			const paletteIdx = centroidRgbMap.get(key) ?? 0;
			const rgb = fittedPalette.rgb[paletteIdx];
			return { ...rgb, alpha: p.alpha };
		});
	}

	/**
	 * K-means の重心をパレットとして使用する Floyd-Steinberg ディザリング
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
		const { colors: uniqueColors, opaqueCount } =
			this.collectUniqueColors(pixels);
		if (opaqueCount === 0 || this.maxColors >= opaqueCount) {
			return pixels;
		}
		if (uniqueColors.length <= this.maxColors) {
			return pixels;
		}

		const fittedPalette = this.buildUniquePalette(
			this.fitCentroids(uniqueColors),
		);
		const palette = fittedPalette.rgb;
		const paletteLabs = fittedPalette.labs;

		if (mode === "none" || strength <= 0) {
			return this.quantizeWithPalette(pixels, palette, paletteLabs);
		}

		if (mode === "floyd-steinberg") {
			return this.applyFloydSteinberg(
				pixels,
				width,
				height,
				palette,
				paletteLabs,
				strength,
			);
		}

		return this.applyOrderedDithering(
			pixels,
			width,
			height,
			palette,
			paletteLabs,
			mode,
			strength,
		);
	}

	private quantizeWithPalette(
		pixels: PixelData[],
		palette: RGB[],
		paletteLabs: Oklab[],
	): PixelData[] {
		const memo = new Map<number, number>();
		return pixels.map((p) => {
			if (p.alpha === 0) return p;
			const key = (p.r << 16) | (p.g << 8) | p.b;
			let bestIdx = memo.get(key);
			if (bestIdx === undefined) {
				const lab = rgbToOklab(p);
				let minDist = Number.MAX_VALUE;
				bestIdx = 0;
				for (let i = 0; i < paletteLabs.length; i++) {
					const dist = this.colorDistanceSq(lab, paletteLabs[i]);
					if (dist < minDist) {
						minDist = dist;
						bestIdx = i;
					}
				}
				memo.set(key, bestIdx);
			}
			const rgb = palette[bestIdx];
			return { ...rgb, alpha: p.alpha };
		});
	}

	private applyFloydSteinberg(
		pixels: PixelData[],
		width: number,
		height: number,
		palette: RGB[],
		paletteLabs: Oklab[],
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

				for (let i = 0; i < paletteLabs.length; i++) {
					const dist = this.colorDistanceSq(lab, paletteLabs[i]);
					if (dist < minDist) {
						minDist = dist;
						bestIdx = i;
					}
				}

				const closest = palette[bestIdx];
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
		palette: RGB[],
		paletteLabs: Oklab[],
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
				// しきい値を -0.5〜0.5 の範囲へ変換し、強度を掛ける
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

				for (let i = 0; i < paletteLabs.length; i++) {
					const dist = this.colorDistanceSq(lab, paletteLabs[i]);
					if (dist < minDist) {
						minDist = dist;
						bestIdx = i;
					}
				}

				const closest = palette[bestIdx];
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

	private collectUniqueColors(pixels: PixelData[]): {
		colors: WeightedColor[];
		opaqueCount: number;
	} {
		const colorMap = new Map<number, WeightedColor>();
		let opaqueCount = 0;
		for (let i = 0; i < pixels.length; i++) {
			const pixel = pixels[i];
			if (pixel.alpha === 0) continue;
			opaqueCount++;
			const key = (pixel.r << 16) | (pixel.g << 8) | pixel.b;
			const entry = colorMap.get(key);
			if (entry) {
				entry.count++;
			} else {
				colorMap.set(key, {
					key,
					lab: rgbToOklab(pixel),
					count: 1,
				});
			}
		}

		const colors = Array.from(colorMap.values());
		// [Intended] 安定した RGB 順序により、浮動小数点の加算順序も固定される。
		colors.sort((left, right) => left.key - right.key);
		return { colors, opaqueCount };
	}

	private fitCentroids(uniqueColors: WeightedColor[]): Oklab[] {
		let centroids = this.initializeCentroids(uniqueColors);
		const sumL = new Float64Array(this.maxColors);
		const suma = new Float64Array(this.maxColors);
		const sumb = new Float64Array(this.maxColors);
		const counts = new Float64Array(this.maxColors);
		let newCentroids = Array.from({ length: this.maxColors }, () => ({
			L: 0,
			a: 0,
			b: 0,
		}));
		const usedColors = new Uint8Array(uniqueColors.length);

		for (let iter = 0; iter < this.maxIterations; iter++) {
			sumL.fill(0);
			suma.fill(0);
			sumb.fill(0);
			counts.fill(0);

			for (let colorIndex = 0; colorIndex < uniqueColors.length; colorIndex++) {
				const color = uniqueColors[colorIndex];
				let minDist = Number.MAX_VALUE;
				let bestCluster = 0;
				for (let i = 0; i < centroids.length; i++) {
					const dist = this.colorDistanceSq(color.lab, centroids[i]);
					if (dist < minDist) {
						minDist = dist;
						bestCluster = i;
					}
				}
				sumL[bestCluster] += color.lab.L * color.count;
				suma[bestCluster] += color.lab.a * color.count;
				sumb[bestCluster] += color.lab.b * color.count;
				counts[bestCluster] += color.count;
			}

			let maxMovement = 0;
			usedColors.fill(0);
			for (let i = 0; i < centroids.length; i++) {
				if (counts[i] === 0) continue;
				const nextCentroid = newCentroids[i];
				nextCentroid.L = sumL[i] / counts[i];
				nextCentroid.a = suma[i] / counts[i];
				nextCentroid.b = sumb[i] / counts[i];
				maxMovement = Math.max(
					maxMovement,
					this.colorDistanceSq(centroids[i], nextCentroid),
				);
				this.markMatchingColor(uniqueColors, nextCentroid, usedColors);
			}

			for (let i = 0; i < centroids.length; i++) {
				if (counts[i] !== 0) continue;
				const colorIndex = this.selectFarthestColor(
					uniqueColors,
					centroids,
					usedColors,
				);
				usedColors[colorIndex] = 1;
				const selectedLab = uniqueColors[colorIndex].lab;
				const nextCentroid = newCentroids[i];
				nextCentroid.L = selectedLab.L;
				nextCentroid.a = selectedLab.a;
				nextCentroid.b = selectedLab.b;
				maxMovement = Math.max(
					maxMovement,
					this.colorDistanceSq(centroids[i], nextCentroid),
				);
			}

			const previousCentroids = centroids;
			centroids = newCentroids;
			newCentroids = previousCentroids;
			if (maxMovement < this.tolerance * this.tolerance) break;
		}

		return centroids;
	}

	private initializeCentroids(uniqueColors: WeightedColor[]): Oklab[] {
		const centroids = new Array<Oklab>(this.maxColors);
		const usedColors = new Uint8Array(uniqueColors.length);
		const minDistances = new Float64Array(uniqueColors.length);
		let firstIndex = 0;
		for (let i = 1; i < uniqueColors.length; i++) {
			const candidate = uniqueColors[i];
			const current = uniqueColors[firstIndex];
			if (
				candidate.count > current.count ||
				(candidate.count === current.count &&
					this.compareColorTie(candidate, current) < 0)
			) {
				firstIndex = i;
			}
		}

		centroids[0] = { ...uniqueColors[firstIndex].lab };
		usedColors[firstIndex] = 1;
		for (let i = 0; i < uniqueColors.length; i++) {
			minDistances[i] = this.colorDistanceSq(uniqueColors[i].lab, centroids[0]);
		}
		for (
			let centroidIndex = 1;
			centroidIndex < this.maxColors;
			centroidIndex++
		) {
			let bestIndex = -1;
			let bestScore = -1;
			for (let colorIndex = 0; colorIndex < uniqueColors.length; colorIndex++) {
				if (usedColors[colorIndex] !== 0) continue;
				const color = uniqueColors[colorIndex];
				const score = minDistances[colorIndex] * color.count;
				if (
					score > bestScore ||
					(score === bestScore &&
						(bestIndex < 0 ||
							this.compareColorTie(color, uniqueColors[bestIndex]) < 0))
				) {
					bestScore = score;
					bestIndex = colorIndex;
				}
			}
			centroids[centroidIndex] = { ...uniqueColors[bestIndex].lab };
			usedColors[bestIndex] = 1;
			// [Intended] シード選択を O(colors * centroids) に保つため、最近傍距離をキャッシュする。
			for (let colorIndex = 0; colorIndex < uniqueColors.length; colorIndex++) {
				if (usedColors[colorIndex] !== 0) continue;
				const distance = this.colorDistanceSq(
					uniqueColors[colorIndex].lab,
					centroids[centroidIndex],
				);
				if (distance < minDistances[colorIndex]) {
					minDistances[colorIndex] = distance;
				}
			}
		}
		return centroids;
	}

	private selectFarthestColor(
		uniqueColors: WeightedColor[],
		centroids: Oklab[],
		usedColors: Uint8Array,
	): number {
		let bestIndex = -1;
		let bestDistance = -1;
		for (let colorIndex = 0; colorIndex < uniqueColors.length; colorIndex++) {
			if (usedColors[colorIndex] !== 0) continue;
			const color = uniqueColors[colorIndex];
			let minDist = Number.MAX_VALUE;
			for (let i = 0; i < centroids.length; i++) {
				minDist = Math.min(
					minDist,
					this.colorDistanceSq(color.lab, centroids[i]),
				);
			}
			if (
				minDist > bestDistance ||
				(minDist === bestDistance &&
					(bestIndex < 0 ||
						this.compareColorTie(color, uniqueColors[bestIndex]) < 0))
			) {
				bestDistance = minDist;
				bestIndex = colorIndex;
			}
		}
		return bestIndex;
	}

	private markMatchingColor(
		uniqueColors: WeightedColor[],
		centroid: Oklab,
		usedColors: Uint8Array,
	): void {
		for (let i = 0; i < uniqueColors.length; i++) {
			const lab = uniqueColors[i].lab;
			if (
				lab.L === centroid.L &&
				lab.a === centroid.a &&
				lab.b === centroid.b
			) {
				usedColors[i] = 1;
				return;
			}
		}
	}

	private buildUniquePalette(centroids: Oklab[]): FittedPalette {
		const rgb: RGB[] = [];
		const labs: Oklab[] = [];
		const usedRgb = new Set<number>();
		for (let i = 0; i < centroids.length; i++) {
			const color = oklabToRgb(centroids[i]);
			const key = (color.r << 16) | (color.g << 8) | color.b;
			if (usedRgb.has(key)) continue;
			usedRgb.add(key);
			rgb.push(color);
			labs.push(centroids[i]);
		}
		return { rgb, labs };
	}

	private compareColorTie(left: WeightedColor, right: WeightedColor): number {
		return (
			left.lab.L - right.lab.L ||
			left.lab.a - right.lab.a ||
			left.lab.b - right.lab.b ||
			left.key - right.key
		);
	}

	private colorDistanceSq(c1: Oklab, c2: Oklab): number {
		const dL = c1.L - c2.L;
		const da = c1.a - c2.a;
		const db = c1.b - c2.b;
		return dL * dL + da * da + db * db;
	}
}
