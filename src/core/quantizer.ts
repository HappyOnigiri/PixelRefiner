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
					const dist = this.colorDistanceSq(lab, this.paletteLabs[i]);
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

	private colorDistanceSq(c1: Oklab, c2: Oklab): number {
		const dL = c1.L - c2.L;
		const da = c1.a - c2.a;
		const db = c1.b - c2.b;
		return dL * dL + da * da + db * db;
	}
}
