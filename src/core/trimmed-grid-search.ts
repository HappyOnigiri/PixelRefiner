import { clampInt } from "../shared/config";
import type { PixelGrid, RawImage } from "../shared/types";
import { downsample } from "./image-operations";

type GridEstimateFromTrimmed = {
	outW: number;
	outH: number;
	cellW: number;
	cellH: number;
	offsetX: number;
	offsetY: number;
	score?: number;
	candidates?: GridEstimateFromTrimmed[];
};

interface GridSearchFromTrimmedStrategy {
	search: (
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		hint?: { outW: number; outH: number },
	) => GridEstimateFromTrimmed | null;
}

const GRID_SIZE_CANDIDATE_COUNT = 10;

type GridSizeCandidate = {
	outW: number;
	outH: number;
	score: number;
};

/**
 * To "disperse" candidate sizes to some extent, divide the outH range into buckets and pick the best from each bucket.
 * - Even if the scale differs significantly, candidates that are not too close to each other are obtained.
 * - The best candidate is always included, and any shortfall is filled in order of score.
 */
const pickDistributedGridSizeCandidates = (
	results: GridSizeCandidate[],
	count: number,
): GridSizeCandidate[] => {
	if (results.length === 0) return [];

	const byScore = [...results].sort((a, b) => a.score - b.score);
	if (byScore.length <= count) return byScore;

	let minOutH = byScore[0].outH;
	let maxOutH = byScore[0].outH;
	for (const r of byScore) {
		if (r.outH < minOutH) minOutH = r.outH;
		if (r.outH > maxOutH) maxOutH = r.outH;
	}
	if (minOutH === maxOutH) return byScore.slice(0, count);

	const range = maxOutH - minOutH + 1;
	const bucketCount = Math.min(count, range);
	const bucketBest: (GridSizeCandidate | null)[] = Array.from(
		{ length: bucketCount },
		() => null,
	);

	for (const r of byScore) {
		const t = (r.outH - minOutH) / Math.max(1, range - 1);
		const b = Math.min(
			bucketCount - 1,
			Math.max(0, Math.floor(t * bucketCount)),
		);
		const cur = bucketBest[b];
		if (!cur || r.score < cur.score) bucketBest[b] = r;
	}

	const selected: GridSizeCandidate[] = [];
	const seen = new Set<string>();

	// Always include the best candidate
	const best = byScore[0];
	selected.push(best);
	seen.add(`${best.outW}x${best.outH}`);

	for (const r of bucketBest) {
		if (!r) continue;
		const key = `${r.outW}x${r.outH}`;
		if (seen.has(key)) continue;
		selected.push(r);
		seen.add(key);
		if (selected.length >= count) break;
	}

	// If there is space, fill with others in order of score
	for (const r of byScore) {
		if (selected.length >= count) break;
		const key = `${r.outW}x${r.outH}`;
		if (seen.has(key)) continue;
		selected.push(r);
		seen.add(key);
	}

	// Sort by size for better display in UI
	selected.sort((a, b) => a.outH - b.outH || a.outW - b.outW);
	return selected.slice(0, count);
};

export class LegacyGridSearchFromTrimmed
	implements GridSearchFromTrimmedStrategy
{
	search(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		hint?: { outW: number; outH: number },
	): GridEstimateFromTrimmed | null {
		return legacySearchGridFromTrimmed(cropped, mask, sampleWindow, hint);
	}
}

export class FastGridSearchFromTrimmed
	implements GridSearchFromTrimmedStrategy
{
	private scan(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		outHMin: number,
		outHMax: number,
		outHStep: number,
		pixelStride: number,
		ratioOverride?: number,
	): { bestOutH: number; est: GridEstimateFromTrimmed } | null {
		const ratio = ratioOverride ?? cropped.width / Math.max(1, cropped.height);
		let best: {
			outW: number;
			outH: number;
			cellW: number;
			cellH: number;
			score: number;
		} | null = null;

		const croppedData = cropped.data;
		const croppedW = cropped.width;
		const croppedH = cropped.height;
		const maskData = mask.data;

		const allResults: GridSizeCandidate[] = [];

		for (let outH = outHMin; outH <= outHMax; outH += outHStep) {
			const outW = Math.max(2, Math.round(outH * ratio));
			if (outW > 600 || outH > 600) continue;

			const cellW = croppedW / outW;
			const cellH = croppedH / outH;
			if (!(cellW > 1 && cellH > 1)) continue;

			const grid: PixelGrid = {
				cellW,
				cellH,
				offsetX: 0,
				offsetY: 0,
				outW,
				outH,
				cropX: 0,
				cropY: 0,
				cropW: croppedW,
				cropH: croppedH,
				score: 0,
			};
			const small = downsample(cropped, grid, sampleWindow);
			const smallData = small.data;

			// Reconstruction error (ignore mask alpha=0 for background)
			let err = 0;
			let n = 0;
			for (let y = 0; y < croppedH; y += pixelStride) {
				const rowOffset = y * croppedW;
				for (let x = 0; x < croppedW; x += pixelStride) {
					const pixelIdx = rowOffset + x;
					const ma = maskData[pixelIdx * 4 + 3];
					if (ma < 16) continue;

					const i = Math.min(outW - 1, Math.max(0, Math.floor(x / cellW)));
					const j = Math.min(outH - 1, Math.max(0, Math.floor(y / cellH)));

					const srcIdx = pixelIdx * 4;
					const r0 = croppedData[srcIdx];
					const g0 = croppedData[srcIdx + 1];
					const b0 = croppedData[srcIdx + 2];

					const dstIdx = (j * outW + i) * 4;
					const r1 = smallData[dstIdx];
					const g1 = smallData[dstIdx + 1];
					const b1 = smallData[dstIdx + 2];
					err += Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1);
					n += 1;
				}
			}
			if (n === 0) continue;

			const reconErr = err / n;
			// Reconstruction error tends to drop monotonically with over-partitioning, so add a penalty proportional to number of cells.
			// Use square root order to balance between low resolution (few cells) and high resolution (many cells).
			const complexityPenalty = 0.16 * Math.sqrt(outW * outH);
			const score = reconErr + complexityPenalty;
			allResults.push({ outH, outW, score });

			if (!best || score < best.score) {
				best = { outW, outH, cellW, cellH, score };
			}
		}

		if (!best) return null;
		const picked = pickDistributedGridSizeCandidates(
			allResults,
			GRID_SIZE_CANDIDATE_COUNT,
		);
		return {
			bestOutH: best.outH,
			est: {
				outW: best.outW,
				outH: best.outH,
				cellW: best.cellW,
				cellH: best.cellH,
				offsetX: 0,
				offsetY: 0,
				score: best.score,
				candidates: picked.map((c) => ({
					outW: c.outW,
					outH: c.outH,
					cellW: croppedW / c.outW,
					cellH: croppedH / c.outH,
					offsetX: 0,
					offsetY: 0,
					score: c.score,
				})),
			},
		};
	}

	search(
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		hint?: { outW: number; outH: number },
	): GridEstimateFromTrimmed | null {
		// Vary outH based on ratio to determine outW (limits search space)
		const outHMin = Math.max(2, Math.floor(cropped.height / 32));
		// If 1 cell is too small (= over-partitioned), error always drops, so require at least ~4px/cell
		const outHMax = Math.min(
			512,
			Math.max(outHMin, Math.floor(cropped.height / 4)),
		);

		// If image is larger, reduce candidates with coarser steps
		const span = outHMax - outHMin;
		const outHStep = span >= 64 ? 3 : span >= 32 ? 2 : 1;

		// Downsample the reconstruction error evaluation points (more effective for larger images)
		const maxDim = Math.max(cropped.width, cropped.height);
		const pixelStride = Math.min(4, Math.max(1, Math.floor(maxDim / 512)));

		// If hint is specified, start precise search (outHStep=1) from its neighborhood
		if (hint) {
			const hintOutH = clampInt(hint.outH, {
				min: outHMin,
				max: outHMax,
				default: hint.outH,
			});
			const radius = Math.max(6, outHStep * 2);
			const r0 = Math.max(outHMin, hintOutH - radius);
			const r1 = Math.min(outHMax, hintOutH + radius);
			const ratioHint = hint.outW / Math.max(1, hint.outH);
			const refinedFromHint = this.scan(
				cropped,
				mask,
				sampleWindow,
				r0,
				r1,
				1,
				Math.max(1, Math.floor(pixelStride / 2)),
				ratioHint,
			);
			return refinedFromHint?.est ?? null;
		}

		const coarse = this.scan(
			cropped,
			mask,
			sampleWindow,
			outHMin,
			outHMax,
			outHStep,
			pixelStride,
		);
		if (!coarse) return null;

		// Fine-grained re-scan around the best coarse-search candidate (stride is reduced as the range is narrow)
		const refineRadius = outHStep * 2;
		const r0 = Math.max(outHMin, coarse.bestOutH - refineRadius);
		const r1 = Math.min(outHMax, coarse.bestOutH + refineRadius);
		const refined = this.scan(
			cropped,
			mask,
			sampleWindow,
			r0,
			r1,
			1,
			Math.max(1, Math.floor(pixelStride / 2)),
		);
		// NOTE:
		// Candidate list (for size adjustment in UI) uses Top 3 from "coarse-search".
		// The finally adopted grid maintains the best result from "refined-search".
		const best = refined?.est ?? coarse.est;
		return { ...best, candidates: coarse.est.candidates };
	}
}

export const getGridSearchFromTrimmedStrategy = (
	fast: boolean,
): GridSearchFromTrimmedStrategy => {
	return fast
		? new FastGridSearchFromTrimmed()
		: new LegacyGridSearchFromTrimmed();
};

const legacySearchGridFromTrimmed = (
	cropped: RawImage,
	mask: RawImage,
	sampleWindow: number,
	hint?: { outW: number; outH: number },
): GridEstimateFromTrimmed | null => {
	// Determine outW by varying outH based on ratio (to limit search space)
	const ratio = cropped.width / Math.max(1, cropped.height);
	const outHMin = Math.max(2, Math.floor(cropped.height / 32));
	// If 1 cell is too small (= over-partitioned), error always drops, so require at least ~4px/cell
	const outHMax = Math.min(
		512,
		Math.max(outHMin, Math.floor(cropped.height / 4)),
	);

	let best: {
		outW: number;
		outH: number;
		cellW: number;
		cellH: number;
		score: number;
	} | null = null;
	const allResults: GridSizeCandidate[] = [];

	const h0 = hint ? Math.max(outHMin, hint.outH - 12) : outHMin;
	const h1 = hint ? Math.min(outHMax, hint.outH + 12) : outHMax;

	for (let outH = h0; outH <= h1; outH += 1) {
		const outW = Math.max(2, Math.round(outH * ratio));
		if (outW > 600 || outH > 600) continue;

		const cellW = cropped.width / outW;
		const cellH = cropped.height / outH;
		if (!(cellW > 1 && cellH > 1)) continue;

		const grid: PixelGrid = {
			cellW,
			cellH,
			offsetX: 0,
			offsetY: 0,
			outW,
			outH,
			cropX: 0,
			cropY: 0,
			cropW: cropped.width,
			cropH: cropped.height,
			score: 0,
		};
		const small = downsample(cropped, grid, sampleWindow);

		// Reconstruction error (ignore mask alpha=0 for background)
		let err = 0;
		let n = 0;
		const croppedData = cropped.data;
		const croppedW = cropped.width;
		const maskData = mask.data;
		const smallData = small.data;

		for (let y = 0; y < cropped.height; y += 1) {
			const rowOffset = y * croppedW;
			for (let x = 0; x < croppedW; x += 1) {
				const pixelIdx = rowOffset + x;
				const ma = maskData[pixelIdx * 4 + 3];
				if (ma < 16) continue;
				const i = Math.min(outW - 1, Math.max(0, Math.floor(x / cellW)));
				const j = Math.min(outH - 1, Math.max(0, Math.floor(y / cellH)));

				const srcIdx = pixelIdx * 4;
				const r0 = croppedData[srcIdx];
				const g0 = croppedData[srcIdx + 1];
				const b0 = croppedData[srcIdx + 2];

				const dstIdx = (j * outW + i) * 4;
				const r1 = smallData[dstIdx];
				const g1 = smallData[dstIdx + 1];
				const b1 = smallData[dstIdx + 2];
				err += Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1);
				n += 1;
			}
		}
		if (n === 0) continue;

		const reconErr = err / n;
		// Reconstruction error tends to drop monotonically with over-partitioning, so add a penalty proportional to number of cells.
		// Use square root order to balance between low resolution (few cells) and high resolution (many cells).
		const complexityPenalty = 0.16 * Math.sqrt(outW * outH);
		const score = reconErr + complexityPenalty;
		allResults.push({ outH, outW, score });

		if (!best || score < best.score) {
			best = { outW, outH, cellW, cellH, score };
		}
	}

	if (!best) return null;
	const picked = pickDistributedGridSizeCandidates(
		allResults,
		GRID_SIZE_CANDIDATE_COUNT,
	);
	return {
		outW: best.outW,
		outH: best.outH,
		cellW: best.cellW,
		cellH: best.cellH,
		offsetX: 0,
		offsetY: 0,
		score: best.score,
		candidates: picked.map((c) => ({
			outW: c.outW,
			outH: c.outH,
			cellW: cropped.width / c.outW,
			cellH: cropped.height / c.outH,
			offsetX: 0,
			offsetY: 0,
			score: c.score,
		})),
	};
};
