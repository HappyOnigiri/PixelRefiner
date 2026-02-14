import type { Oklab, PixelData, RGB } from "../shared/types";
import { oklabToRgb, rgbToOklab } from "./colorUtils";

export class OklabKMeans {
	constructor(
		private maxColors: number,
		private maxIterations: number = 20,
		private tolerance: number = 0.001,
	) {}

	/**
	 * K-means clustering to reduce colors
	 */
	quantize(pixels: PixelData[]): PixelData[] {
		// 1. Pre-processing: Extract unique opaque colors to speed up K-means
		const opaquePixels = pixels.filter((p) => p.alpha > 0);
		if (opaquePixels.length === 0 || this.maxColors >= opaquePixels.length) {
			return pixels;
		}

		// Use a Map to count occurrences of each color for weighted centroids
		const colorMap = new Map<number, { lab: Oklab; count: number }>();
		for (const p of opaquePixels) {
			const key = (p.r << 16) | (p.g << 8) | p.b;
			const entry = colorMap.get(key);
			if (entry) {
				entry.count++;
			} else {
				colorMap.set(key, { lab: rgbToOklab(p), count: 1 });
			}
		}

		const uniqueColors = Array.from(colorMap.values());
		if (uniqueColors.length <= this.maxColors) {
			return pixels;
		}

		// 2. Initialization: Randomly pick maxColors as initial centroids
		let centroids: Oklab[] = this.initializeCentroids(uniqueColors);

		// 3. Main Loop
		for (let iter = 0; iter < this.maxIterations; iter++) {
			const clusters: {
				sumL: number;
				suma: number;
				sumb: number;
				count: number;
			}[] = Array.from({ length: this.maxColors }, () => ({
				sumL: 0,
				suma: 0,
				sumb: 0,
				count: 0,
			}));

			// Assignment
			for (const color of uniqueColors) {
				let minDist = Number.MAX_VALUE;
				let bestCluster = 0;

				for (let i = 0; i < centroids.length; i++) {
					const dist = this.colorDistanceSq(color.lab, centroids[i]);
					if (dist < minDist) {
						minDist = dist;
						bestCluster = i;
					}
				}

				const cluster = clusters[bestCluster];
				cluster.sumL += color.lab.L * color.count;
				cluster.suma += color.lab.a * color.count;
				cluster.sumb += color.lab.b * color.count;
				cluster.count += color.count;
			}

			// Update
			let maxMovement = 0;
			const newCentroids: Oklab[] = [];
			for (let i = 0; i < centroids.length; i++) {
				const cluster = clusters[i];
				if (cluster.count > 0) {
					const nextCentroid = {
						L: cluster.sumL / cluster.count,
						a: cluster.suma / cluster.count,
						b: cluster.sumb / cluster.count,
					};
					const movement = this.colorDistanceSq(centroids[i], nextCentroid);
					maxMovement = Math.max(maxMovement, movement);
					newCentroids.push(nextCentroid);
				} else {
					// If a cluster is empty, re-initialize it with a random color
					newCentroids.push(
						uniqueColors[Math.floor(Math.random() * uniqueColors.length)].lab,
					);
				}
			}

			centroids = newCentroids;
			if (maxMovement < this.tolerance * this.tolerance) break;
		}

		// 4. Mapping: Replace each pixel with the nearest centroid
		const palette = centroids.map((lab) => oklabToRgb(lab));
		const centroidRgbMap = new Map<number, number>(); // unique color key -> palette index

		for (const [key, entry] of colorMap.entries()) {
			let minDist = Number.MAX_VALUE;
			let bestIdx = 0;
			for (let i = 0; i < centroids.length; i++) {
				const dist = this.colorDistanceSq(entry.lab, centroids[i]);
				if (dist < minDist) {
					minDist = dist;
					bestIdx = i;
				}
			}
			centroidRgbMap.set(key, bestIdx);
		}

		return pixels.map((p) => {
			if (p.alpha === 0) return p;
			const key = (p.r << 16) | (p.g << 8) | p.b;
			const paletteIdx = centroidRgbMap.get(key) ?? 0;
			const rgb = palette[paletteIdx];
			return { ...rgb, alpha: p.alpha };
		});
	}

	/**
	 * Floyd-Steinberg dithering using K-means centroids as palette
	 */
	dither(
		pixels: PixelData[],
		width: number,
		height: number,
		strength = 1.0,
	): PixelData[] {
		// 1. Get palette via K-means (using existing quantize logic to find centroids)
		const opaquePixels = pixels.filter((p) => p.alpha > 0);
		if (opaquePixels.length === 0 || this.maxColors >= opaquePixels.length) {
			return pixels;
		}

		const colorMap = new Map<number, { lab: Oklab; count: number }>();
		for (const p of opaquePixels) {
			const key = (p.r << 16) | (p.g << 8) | p.b;
			const entry = colorMap.get(key);
			if (entry) {
				entry.count++;
			} else {
				colorMap.set(key, { lab: rgbToOklab(p), count: 1 });
			}
		}

		const uniqueColors = Array.from(colorMap.values());
		if (uniqueColors.length <= this.maxColors) {
			return pixels;
		}

		let centroids: Oklab[] = this.initializeCentroids(uniqueColors);
		// Run K-means (simplified version of quantize loop to get centroids)
		for (let iter = 0; iter < this.maxIterations; iter++) {
			const clusters = Array.from({ length: this.maxColors }, () => ({
				sumL: 0,
				suma: 0,
				sumb: 0,
				count: 0,
			}));
			for (const color of uniqueColors) {
				let minDist = Number.MAX_VALUE;
				let bestCluster = 0;
				for (let i = 0; i < centroids.length; i++) {
					const dist = this.colorDistanceSq(color.lab, centroids[i]);
					if (dist < minDist) {
						minDist = dist;
						bestCluster = i;
					}
				}
				const cluster = clusters[bestCluster];
				cluster.sumL += color.lab.L * color.count;
				cluster.suma += color.lab.a * color.count;
				cluster.sumb += color.lab.b * color.count;
				cluster.count += color.count;
			}
			let maxMovement = 0;
			const newCentroids: Oklab[] = [];
			for (let i = 0; i < centroids.length; i++) {
				const cluster = clusters[i];
				if (cluster.count > 0) {
					const nextCentroid = {
						L: cluster.sumL / cluster.count,
						a: cluster.suma / cluster.count,
						b: cluster.sumb / cluster.count,
					};
					const movement = this.colorDistanceSq(centroids[i], nextCentroid);
					maxMovement = Math.max(maxMovement, movement);
					newCentroids.push(nextCentroid);
				} else {
					newCentroids.push(
						uniqueColors[Math.floor(Math.random() * uniqueColors.length)].lab,
					);
				}
			}
			centroids = newCentroids;
			if (maxMovement < this.tolerance * this.tolerance) break;
		}

		const palette = centroids.map((lab) => oklabToRgb(lab));
		const paletteLabs = centroids;

		// 2. Apply Floyd-Steinberg dithering
		const out = pixels.map((p) => ({ ...p }));
		// Use a temporary error buffer to avoid modifying original pixel values too much
		// but for simplicity in JS, we'll just modify the 'out' array.
		// Since we need to handle Oklab distance for better quality, we'll convert as we go.

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

				// Distribute error
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

	private initializeCentroids(
		uniqueColors: { lab: Oklab; count: number }[],
	): Oklab[] {
		const centroids: Oklab[] = [];
		const usedIndices = new Set<number>();

		// Simple random initialization
		while (
			centroids.length < this.maxColors &&
			usedIndices.size < uniqueColors.length
		) {
			const idx = Math.floor(Math.random() * uniqueColors.length);
			if (!usedIndices.has(idx)) {
				usedIndices.add(idx);
				centroids.push(uniqueColors[idx].lab);
			}
		}
		return centroids;
	}

	private colorDistanceSq(c1: Oklab, c2: Oklab): number {
		const dL = c1.L - c2.L;
		const da = c1.a - c2.a;
		const db = c1.b - c2.b;
		return dL * dL + da * da + db * db;
	}
}

/**
 * Fixed palette quantization using Oklab distance
 */
export class PaletteQuantizer {
	private paletteLabs: Oklab[];

	constructor(private palette: RGB[]) {
		this.paletteLabs = palette.map((rgb) => rgbToOklab(rgb));
	}

	quantize(pixels: PixelData[]): PixelData[] {
		const memo = new Map<number, number>(); // RGB key -> palette index

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

					// Oklab distance
					let dist = this.colorDistanceSq(lab, targetLab);

					// 暗いピクセルの場合、茶色などの暗色に引っ張られないよう
					// 純粋な黒（L=0）への判定にバイアスをかけるか、RGB距離を補助的に使用する。
					// 特に NES の黒 (#000000) と茶色 (#503000) の誤判定を防ぐ。
					const isTargetBlack =
						targetRgb.r === 0 && targetRgb.g === 0 && targetRgb.b === 0;

					if (isTargetBlack) {
						// L=0.2 程度（sRGBで約45-50）以下の極めて暗いピクセルのみバイアスをかける。
						// こうすることで、Game Boy パレットなどの「暗いグレー」が黒に判定されるのを防ぐ。
						if (lab.L < 0.2) {
							const lBias = (0.2 - lab.L) * 1.5;
							dist -= lBias * lBias;
						}
					}

					// RGB 空間での距離も補助的に使用する（極めて暗い色のみ）。
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
	 * Floyd-Steinberg dithering using fixed palette
	 */
	dither(
		pixels: PixelData[],
		width: number,
		height: number,
		strength = 1.0,
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

				// Distribute error
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
