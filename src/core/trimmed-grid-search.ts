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
 * 候補サイズをある程度「分散」させるため、outH の範囲をバケットに分け、各バケットから最良候補を選ぶ。
 * - スケールが大きく異なっても、互いに近すぎない候補を得られる。
 * - 最良候補は必ず含め、不足分はスコア順に補う。
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

	// 最良候補は常に含める
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

	// 空きがあれば、他の候補をスコア順に追加する
	for (const r of byScore) {
		if (selected.length >= count) break;
		const key = `${r.outW}x${r.outH}`;
		if (seen.has(key)) continue;
		selected.push(r);
		seen.add(key);
	}

	// UI で見やすいようサイズ順に並べる
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
			// [Intended] 候補数が多い探索では計算量を抑えるため互換サンプラーで再構成誤差を近似する。
			const small = downsample(cropped, grid, sampleWindow);
			const smallData = small.data;

			// 再構成誤差（背景のマスク alpha=0 は無視する）
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
			// 再構成誤差は過分割で単調に下がりやすいため、セル数に比例するペナルティを加える。
			// 低解像度（少ないセル）と高解像度（多いセル）のバランスを取るため、平方根オーダーを使用する。
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
		// 比率に基づいて outH を変化させ、outW を決定する（探索空間を制限する）
		const outHMin = Math.max(2, Math.floor(cropped.height / 32));
		// 1 セルが小さすぎる（= 過分割）と誤差は常に下がるため、少なくとも約 4px/セルを要求する
		const outHMax = Math.min(
			512,
			Math.max(outHMin, Math.floor(cropped.height / 4)),
		);

		// 画像が大きい場合は粗い刻みで候補を減らす
		const span = outHMax - outHMin;
		const outHStep = span >= 64 ? 3 : span >= 32 ? 2 : 1;

		// 再構成誤差の評価点をダウンサンプリングする（大きい画像ほど効果的）
		const maxDim = Math.max(cropped.width, cropped.height);
		const pixelStride = Math.min(4, Math.max(1, Math.floor(maxDim / 512)));

		// ヒントが指定されている場合は、その近傍から精密検索（outHStep=1）を開始する
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

		// 粗い検索の最良候補周辺を細かく再走査する（範囲が狭いため刻みを小さくする）
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
		// 注記:
		// 候補リスト（UI でのサイズ調整用）には「粗い検索」の上位 3 件を使用する。
		// 最終的に採用するグリッドは「精密検索」の最良結果を維持する。
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
	// 比率に基づいて outH を変化させ、outW を決定する（探索空間を制限する）
	const ratio = cropped.width / Math.max(1, cropped.height);
	const outHMin = Math.max(2, Math.floor(cropped.height / 32));
	// 1 セルが小さすぎる（= 過分割）と誤差は常に下がるため、少なくとも約 4px/セルを要求する
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
		// [Intended] 候補数が多い探索では計算量を抑えるため互換サンプラーで再構成誤差を近似する。
		const small = downsample(cropped, grid, sampleWindow);

		// 再構成誤差（背景のマスク alpha=0 は無視する）
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
		// 再構成誤差は過分割で単調に下がりやすいため、セル数に比例するペナルティを加える。
		// 低解像度（少ないセル）と高解像度（多いセル）のバランスを取るため、平方根オーダーを使用する。
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
