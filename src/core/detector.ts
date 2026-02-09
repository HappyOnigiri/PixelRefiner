import type { Pixel, PixelGrid, RawImage } from "../shared/types";
import { computeMedian, computePercentile } from "./math";
import { extractStrip, posterize } from "./ops";

type Run = { start: number; length: number; color: [number, number, number] };
type Segment = { start: number; runs: Run[] };

const quantize = (value: number, step: number): number => {
	if (step <= 0) {
		return value;
	}
	return Math.min(255, Math.max(0, Math.floor(value / step) * step));
};

const colorEq = (
	a: [number, number, number],
	b: [number, number, number],
): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const getRunLengths = (
	strip: Pixel[],
	quantStep: number,
	alphaThreshold = 16,
): Segment[] => {
	if (strip.length === 0) {
		return [];
	}
	const opaque = strip.map((p) => p[3] >= alphaThreshold);
	if (!opaque.some(Boolean)) {
		return [];
	}

	const segments: Segment[] = [];
	const n = strip.length;
	let i = 0;
	while (i < n) {
		if (!opaque[i]) {
			i += 1;
			continue;
		}
		const segStart = i;
		while (i < n && opaque[i]) {
			i += 1;
		}
		const segEnd = i;
		const seg = strip.slice(segStart, segEnd);
		if (seg.length === 0) {
			continue;
		}
		const runs: Run[] = [];
		let runStart = 0;
		let prev: [number, number, number] = [
			quantize(seg[0][0], quantStep),
			quantize(seg[0][1], quantStep),
			quantize(seg[0][2], quantStep),
		];
		for (let k = 1; k < seg.length; k += 1) {
			const cur: [number, number, number] = [
				quantize(seg[k][0], quantStep),
				quantize(seg[k][1], quantStep),
				quantize(seg[k][2], quantStep),
			];
			if (!colorEq(cur, prev)) {
				runs.push({
					start: segStart + runStart,
					length: k - runStart,
					color: prev,
				});
				runStart = k;
				prev = cur;
			}
		}
		runs.push({
			start: segStart + runStart,
			length: seg.length - runStart,
			color: prev,
		});

		if (runs.length >= 3) {
			const smoothed: Run[] = [];
			for (let idx = 0; idx < runs.length; idx += 1) {
				const run = runs[idx];
				if (run.length === 1) {
					const prevColor = idx - 1 >= 0 ? runs[idx - 1].color : null;
					const nextColor = idx + 1 < runs.length ? runs[idx + 1].color : null;
					if (prevColor && nextColor && colorEq(prevColor, nextColor)) {
						if (smoothed.length > 0) {
							const last = smoothed[smoothed.length - 1];
							smoothed[smoothed.length - 1] = {
								start: last.start,
								length: last.length + 1,
								color: last.color,
							};
						} else {
							smoothed.push({
								start: run.start,
								length: run.length,
								color: prevColor,
							});
						}
						continue;
					}
				}
				smoothed.push(run);
			}
			segments.push({ start: segStart, runs: smoothed });
		} else {
			segments.push({ start: segStart, runs });
		}
	}
	return segments;
};

type Estimate = { cellSize: number; offset: number; score: number };

export type DetectOptions = {
	detectionQuantStep?: number;
	/**
	 * 自動検出時の最大セル数（= outW/outH の上限）を調整する。
	 * デフォルトは 128。
	 */
	autoMaxCellsW?: number;
	autoMaxCellsH?: number;
	/**
	 * 自動検出時のサンプリング本数（各軸）。大きいほど安定しやすいが遅くなる。
	 * デフォルト: 12
	 */
	detectionStrips?: number;
	/**
	 * 背景色を推定してマスクした上で検出する（背景ノイズ対策）。
	 * デフォルト: true
	 */
	backgroundMask?: boolean;
	/**
	 * 背景マスクの許容誤差（RGB の各チャンネル絶対差）。未指定なら四隅から自動推定。
	 */
	backgroundMaskTolerance?: number;
	/**
	 * 検出過程を console に出す（調査用）。
	 */
	debug?: boolean;
	debugLabel?: string;
};

export const detectGrid = (
	img: RawImage,
	options: DetectOptions = {},
): PixelGrid => {
	const detectionQuantStep = options.detectionQuantStep ?? 64;

	const h = img.height;
	const w = img.width;
	const det = posterize(img, detectionQuantStep);

	const cloneImage = (src: RawImage): RawImage => ({
		width: src.width,
		height: src.height,
		data: new Uint8ClampedArray(src.data),
	});

	const dominantBackground = (
		src: RawImage,
	): {
		bgKeySet: Set<string>;
		bgKeys: string[];
		coveredRatio: number;
	} => {
		const counts = new Map<string, number>();
		const totalPx = src.width * src.height;
		for (let i = 0; i < src.data.length; i += 4) {
			const r = src.data[i];
			const g = src.data[i + 1];
			const b = src.data[i + 2];
			const key = `${r},${g},${b}`;
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

		const coverTarget = 0.7;
		const maxColors = 8;
		let covered = 0;
		const bgKeys: string[] = [];
		for (const [k, c] of sorted) {
			bgKeys.push(k);
			covered += c;
			if (bgKeys.length >= maxColors) break;
			if (covered / totalPx >= coverTarget) break;
		}
		return {
			bgKeySet: new Set(bgKeys),
			bgKeys,
			coveredRatio: covered / totalPx,
		};
	};

	const maskBackgroundByKeys = (
		src: RawImage,
		bgKeySet: Set<string>,
	): RawImage => {
		const out = cloneImage(src);
		for (let i = 0; i < out.data.length; i += 4) {
			const key = `${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`;
			if (bgKeySet.has(key)) {
				out.data[i + 3] = 0;
			}
		}
		return out;
	};

	const pickDenseStrips = (
		masked: RawImage,
		axis: "x" | "y",
		count: number,
	): number[] => {
		const len = axis === "y" ? masked.height : masked.width;
		const otherLen = axis === "y" ? masked.width : masked.height;
		const scores: Array<{ idx: number; score: number }> = [];
		for (let i = 0; i < len; i += 1) {
			let s = 0;
			if (axis === "y") {
				const y = i;
				const rowStart = y * otherLen * 4;
				for (let x = 0; x < otherLen; x += 1) {
					const a = masked.data[rowStart + x * 4 + 3];
					if (a >= 16) s += 1;
				}
			} else {
				const x = i;
				for (let y = 0; y < otherLen; y += 1) {
					const a = masked.data[(y * masked.width + x) * 4 + 3];
					if (a >= 16) s += 1;
				}
			}
			scores.push({ idx: i, score: s });
		}
		scores.sort((a, b) => b.score - a.score);

		const picked: number[] = [];
		// 隙間の多い画像では「内容のあるライン」が局所的に固まるので、離しすぎない
		const minSep = Math.max(1, Math.floor(len / Math.max(1, count * 6)));
		for (const item of scores) {
			if (item.score <= 0) break;
			if (picked.every((p) => Math.abs(p - item.idx) >= minSep)) {
				picked.push(item.idx);
				if (picked.length >= count) break;
			}
		}
		return picked;
	};

	const stripCount = options.detectionStrips ?? 12;
	const shouldMaskBackground = options.backgroundMask ?? true;

	// 想定グリッドが無い場合は「内容が濃い」ラインを選んで検出する。
	// ただし背景マスクは「ライン選定」にだけ使い、run 境界の計算は元画像（ポスタライズ結果）で行う。
	// （隙間の多い画像では、背景をマスクしすぎると周期（セルサイズ）が推定しづらくなるため）
	const bgInfo = shouldMaskBackground ? dominantBackground(det) : null;
	const detForPick = bgInfo ? maskBackgroundByKeys(det, bgInfo.bgKeySet) : det;
	const detForDetect = det;

	if (options.debug && bgInfo) {
		// eslint-disable-next-line no-console
		console.log("[detectGrid]", options.debugLabel ?? "", {
			backgroundMask: {
				mode: "dominantColors",
				bgKeys: bgInfo.bgKeys.slice(0, 5),
				bgColorCount: bgInfo.bgKeys.length,
				coveredRatio: bgInfo.coveredRatio,
			},
		});
	}

	const fallbackYs = [Math.round(h / 3), Math.round((2 * h) / 3)];
	const fallbackXs = [Math.round(w / 3), Math.round((2 * w) / 3)];
	const ys = (() => {
		const picked = pickDenseStrips(detForPick, "y", stripCount);
		return picked.length > 0 ? picked : fallbackYs;
	})();
	const xs = (() => {
		const picked = pickDenseStrips(detForPick, "x", stripCount);
		return picked.length > 0 ? picked : fallbackXs;
	})();

	if (options.debug) {
		// eslint-disable-next-line no-console
		console.log("[detectGrid]", options.debugLabel ?? "", {
			stripCount,
			shouldMaskBackground,
			picked: { ys, xs },
		});
	}

	const expMinX = 8;
	const expMaxX = options.autoMaxCellsW ?? 128;
	const twX = 2.0;
	const expMinY = 8;
	const expMaxY = options.autoMaxCellsH ?? 128;
	const twY = 2.0;

	type BoundaryData = { runLengths: number[]; boundaries: number[] };
	const collectBoundaryData = (segLists: Segment[][]): BoundaryData => {
		const runLengths: number[] = [];
		const boundaries: number[] = [];
		for (const segments of segLists) {
			for (const segment of segments) {
				segment.runs.forEach((run, idx) => {
					if (run.length >= 2) runLengths.push(run.length);
					if (idx > 0) boundaries.push(run.start);
				});
			}
		}
		return { runLengths, boundaries };
	};

	const buildScanlineBoundaryData = (
		axis: "x" | "y",
		lines: number[],
		bgKeySet: Set<string>,
	): BoundaryData => {
		const len = axis === "x" ? w : h;
		const runLengths: number[] = [];
		const boundaries: number[] = [];

		for (const line of lines) {
			let i = 0;
			// 初期状態
			const isFgAt = (pos: number): 0 | 1 => {
				let idx: number;
				if (axis === "x") {
					// y 固定で x を動かす
					idx = (line * w + pos) * 4;
				} else {
					// x 固定で y を動かす
					idx = (pos * w + line) * 4;
				}
				const key = `${detForDetect.data[idx]},${detForDetect.data[idx + 1]},${detForDetect.data[idx + 2]}`;
				return bgKeySet.has(key) ? 0 : 1;
			};

			let cur: 0 | 1 = isFgAt(0);
			let start = 0;
			i = 1;
			while (i < len) {
				const v = isFgAt(i);
				if (v !== cur) {
					const runLen = i - start;
					if (runLen >= 2) runLengths.push(runLen);
					boundaries.push(i);
					cur = v;
					start = i;
				}
				i += 1;
			}
			// last run
			const lastLen = len - start;
			if (lastLen >= 2) runLengths.push(lastLen);
		}

		return { runLengths, boundaries };
	};

	const estimateFromSegments = (
		segLists: Segment[][],
		length: number,
		expectedCellsMin: number,
		expectedCellsMax: number,
		targetCells?: number,
		targetWeight = 2.0,
		maxCell = 256,
	): Estimate | null => {
		const { runLengths, boundaries } = collectBoundaryData(segLists);
		if (runLengths.length < 2 || boundaries.length < 2) {
			return null;
		}
		const maxLen = Math.min(maxCell, Math.max(...runLengths));
		if (maxLen < 2) return null;

		const counts = new Array(maxLen + 1).fill(0);
		for (const rl of runLengths) {
			const v = Math.min(maxLen, Math.max(0, Math.floor(rl)));
			counts[v] += 1;
		}

		const candidateSizes = new Set<number>();
		for (let s = 2; s <= maxLen; s += 1) {
			if (counts[s] > 0) candidateSizes.add(s);
		}
		for (let cells = expectedCellsMin; cells <= expectedCellsMax; cells += 1) {
			const s = Math.round(length / cells);
			if (s >= 2 && s <= maxCell) candidateSizes.add(s);
			if (s - 1 >= 2 && s - 1 <= maxCell) candidateSizes.add(s - 1);
			if (s + 1 >= 2 && s + 1 <= maxCell) candidateSizes.add(s + 1);
		}
		const candidates = Array.from(candidateSizes).filter(
			(s) => s >= 2 && s <= maxCell,
		);
		if (candidates.length === 0) return null;

		let best: Estimate | null = null;
		for (const s of candidates) {
			let bestOff = 0;
			let bestFit = Number.POSITIVE_INFINITY;
			for (let off = 0; off < s; off += 1) {
				const deviations = boundaries.map((b) => {
					const r = (((b - off) % s) + s) % s;
					return Math.min(r, s - r);
				});
				const fit = computeMedian(deviations);
				if (fit < bestFit) {
					bestFit = fit;
					bestOff = off;
				}
			}

			const deviations = boundaries.map((b) => {
				const r = (((b - bestOff) % s) + s) % s;
				return Math.min(r, s - r);
			});
			const p50 = computeMedian(deviations);
			const p90 = computePercentile(deviations, 90);
			const cells = Math.floor((length - bestOff) / s);
			if (cells <= 0) continue;

			let penalty = 0;
			if (cells < expectedCellsMin) penalty += (expectedCellsMin - cells) * 5;
			if (cells > expectedCellsMax) penalty += (cells - expectedCellsMax) * 5;
			let targetPenalty = 0;
			if (targetCells !== undefined) {
				targetPenalty = Math.abs(cells - targetCells) * targetWeight;
			}
			const countBonus = -0.25 * Math.log1p(counts[s] ?? 0);
			const total = p50 + 0.35 * p90 + penalty + targetPenalty + countBonus;

			if (!best) {
				best = { cellSize: s, offset: bestOff, score: total };
				continue;
			}
			const eps = 0.35;
			if (total < best.score - eps) {
				best = { cellSize: s, offset: bestOff, score: total };
			} else if (
				targetCells === undefined &&
				Math.abs(total - best.score) <= eps &&
				s > best.cellSize
			) {
				best = { cellSize: s, offset: bestOff, score: total };
			}
		}
		return best;
	};

	const estimateFromBoundaryData = (
		data: BoundaryData,
		length: number,
		expectedCellsMin: number,
		expectedCellsMax: number,
		targetCells?: number,
		targetWeight = 2.0,
		maxCell = 256,
	): Estimate | null => {
		const { runLengths, boundaries } = data;
		if (runLengths.length < 2 || boundaries.length < 2) return null;

		const maxLen = Math.min(maxCell, Math.max(...runLengths));
		if (maxLen < 2) return null;

		const counts = new Array(maxLen + 1).fill(0);
		for (const rl of runLengths) {
			const v = Math.min(maxLen, Math.max(0, Math.floor(rl)));
			counts[v] += 1;
		}

		const candidateSizes = new Set<number>();
		for (let s = 2; s <= maxLen; s += 1) {
			if (counts[s] > 0) candidateSizes.add(s);
		}
		for (let cells = expectedCellsMin; cells <= expectedCellsMax; cells += 1) {
			const s = Math.round(length / cells);
			if (s >= 2 && s <= maxCell) candidateSizes.add(s);
			if (s - 1 >= 2 && s - 1 <= maxCell) candidateSizes.add(s - 1);
			if (s + 1 >= 2 && s + 1 <= maxCell) candidateSizes.add(s + 1);
		}
		const candidates = Array.from(candidateSizes).filter(
			(s) => s >= 2 && s <= maxCell,
		);
		if (candidates.length === 0) return null;

		let best: Estimate | null = null;
		for (const s of candidates) {
			let bestOff = 0;
			let bestFit = Number.POSITIVE_INFINITY;
			for (let off = 0; off < s; off += 1) {
				const deviations = boundaries.map((b) => {
					const r = (((b - off) % s) + s) % s;
					return Math.min(r, s - r);
				});
				const fit = computeMedian(deviations);
				if (fit < bestFit) {
					bestFit = fit;
					bestOff = off;
				}
			}

			const deviations = boundaries.map((b) => {
				const r = (((b - bestOff) % s) + s) % s;
				return Math.min(r, s - r);
			});
			const p50 = computeMedian(deviations);
			const p90 = computePercentile(deviations, 90);
			const cells = Math.floor((length - bestOff) / s);
			if (cells <= 0) continue;

			let penalty = 0;
			if (cells < expectedCellsMin) penalty += (expectedCellsMin - cells) * 5;
			if (cells > expectedCellsMax) penalty += (cells - expectedCellsMax) * 5;
			let targetPenalty = 0;
			if (targetCells !== undefined) {
				targetPenalty = Math.abs(cells - targetCells) * targetWeight;
			}
			const countBonus = -0.25 * Math.log1p(counts[s] ?? 0);
			const total = p50 + 0.35 * p90 + penalty + targetPenalty + countBonus;

			if (!best || total < best.score) {
				best = { cellSize: s, offset: bestOff, score: total };
			}
		}
		return best;
	};

	const xSegLists = ys.map((y) => {
		const strip = extractStrip(detForDetect, "y", y);
		const seg = getRunLengths(strip, detectionQuantStep);
		if (options.debug) {
			// eslint-disable-next-line no-console
			console.log("[detectGrid:x]", options.debugLabel ?? "", {
				y,
				segments: seg.length,
			});
		}
		return seg;
	});
	const estX = bgInfo
		? (estimateFromBoundaryData(
				buildScanlineBoundaryData("x", ys, bgInfo.bgKeySet),
				w,
				expMinX,
				expMaxX,
				undefined,
				twX,
			) ?? estimateFromSegments(xSegLists, w, expMinX, expMaxX, undefined, twX))
		: estimateFromSegments(xSegLists, w, expMinX, expMaxX, undefined, twX);
	const estX2 = estX
		? (() => {
				const cells = Math.floor((w - estX.offset) / estX.cellSize);
				if (cells <= 96) return null;
				const relaxedMax = 64;
				const retry = estimateFromSegments(
					xSegLists,
					w,
					expMinX,
					relaxedMax,
					undefined,
					twX,
				);
				if (options.debug) {
					// eslint-disable-next-line no-console
					console.log("[detectGrid:x:retry]", options.debugLabel ?? "", {
						cells,
						relaxedMax,
						estX,
						retry,
					});
				}
				return retry;
			})()
		: null;

	const ySegLists = xs.map((x) => {
		const strip = extractStrip(detForDetect, "x", x);
		const seg = getRunLengths(strip, detectionQuantStep);
		if (options.debug) {
			// eslint-disable-next-line no-console
			console.log("[detectGrid:y]", options.debugLabel ?? "", {
				x,
				segments: seg.length,
			});
		}
		return seg;
	});
	const estY = bgInfo
		? (estimateFromBoundaryData(
				buildScanlineBoundaryData("y", xs, bgInfo.bgKeySet),
				h,
				expMinY,
				expMaxY,
				undefined,
				twY,
			) ?? estimateFromSegments(ySegLists, h, expMinY, expMaxY, undefined, twY))
		: estimateFromSegments(ySegLists, h, expMinY, expMaxY, undefined, twY);
	const estY2 = estY
		? (() => {
				const cells = Math.floor((h - estY.offset) / estY.cellSize);
				if (cells <= 96) return null;
				const relaxedMax = 64;
				const retry = estimateFromSegments(
					ySegLists,
					h,
					expMinY,
					relaxedMax,
					undefined,
					twY,
				);
				if (options.debug) {
					// eslint-disable-next-line no-console
					console.log("[detectGrid:y:retry]", options.debugLabel ?? "", {
						cells,
						relaxedMax,
						estY,
						retry,
					});
				}
				return retry;
			})()
		: null;

	const finalX = estX2 ?? estX;
	const finalY = estY2 ?? estY;

	if (!finalX || !finalY) {
		throw new Error(
			"グリッド検出に失敗しました。入力画像やオプションを確認してください。",
		);
	}

	const cellW = Math.max(1, Math.round(finalX.cellSize));
	const cellH = Math.max(1, Math.round(finalY.cellSize));
	const offsetX = ((finalX.offset % cellW) + cellW) % cellW;
	const offsetY = ((finalY.offset % cellH) + cellH) % cellH;
	const outW = Math.max(1, Math.floor((w - offsetX) / cellW));
	const outH = Math.max(1, Math.floor((h - offsetY) / cellH));
	const cropW = outW * cellW;
	const cropH = outH * cellH;

	if (options.debug) {
		// eslint-disable-next-line no-console
		console.log("[detectGrid:result]", options.debugLabel ?? "", {
			cell: { cellW, cellH },
			offset: { offsetX, offsetY },
			out: { outW, outH },
			score: { scoreX: finalX.score, scoreY: finalY.score },
		});
	}

	return {
		cellW,
		cellH,
		offsetX,
		offsetY,
		score: (finalX.score + finalY.score) / 2,
		cropX: offsetX,
		cropY: offsetY,
		cropW,
		cropH,
		outW,
		outH,
		scoreX: finalX.score,
		scoreY: finalY.score,
	};
};
