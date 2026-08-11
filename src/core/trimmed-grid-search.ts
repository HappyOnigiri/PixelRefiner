import {
	BOUNDARY_CONTRAST_LIMITS,
	clampInt,
	TRIMMED_GRID_SEARCH_LIMITS,
	TRIMMED_GRID_SEARCH_WEIGHTS,
} from "../shared/config";
import type { GridSignalOptions, PixelGrid, RawImage } from "../shared/types";
import {
	type AxisBoundaryContrastEvaluator,
	type BoundaryContrastEvaluator,
	createAxisBoundaryContrastEvaluator,
} from "./grid-signals/boundary-contrast";
import { downsample } from "./image-operations";

type GridEstimateFromTrimmed = {
	outW: number;
	outH: number;
	cellW: number;
	cellH: number;
	offsetX: number;
	offsetY: number;
	score?: number;
	/** この格子の境界コントラスト。 */
	gridEvidence?: number;
	/**
	 * 乗り換え先として許す出力高さの範囲で得られた、最大の境界コントラスト。
	 * 曖昧さの判定に使う。
	 */
	gridEvidenceMax?: number;
	/** 採用格子と、境界がもっとも揃う格子が食い違っているか。 */
	gridEvidenceContested?: boolean;
	/**
	 * offsetX/offsetY が実測した位相かどうか。false（未指定）なら位相は未測定で、
	 * 投影側は従来どおりキャンバス左上を起点にする。
	 */
	phaseMeasured?: boolean;
	candidates?: GridEstimateFromTrimmed[];
};

interface GridSearchFromTrimmedStrategy {
	search: (
		cropped: RawImage,
		mask: RawImage,
		sampleWindow: number,
		hint?: { outW: number; outH: number },
		signalOptions?: Partial<GridSignalOptions>,
	) => GridEstimateFromTrimmed | null;
}

const GRID_SIZE_CANDIDATE_COUNT = 10;

type GridSizeCandidate = {
	outW: number;
	outH: number;
	score: number;
};

/** 再構成スコアが最小の候補。 */
const bestByScore = (results: GridSizeCandidate[]): GridSizeCandidate => {
	let best = results[0];
	for (let index = 1; index < results.length; index += 1) {
		if (results[index].score < best.score) best = results[index];
	}
	return best;
};

/**
 * 最良候補の倍音にあたる出力サイズ。粗い側（1/f）と細かい側（f 倍）の両方。
 *
 * [Intended] 倍率は乗り換え判定と同じ config の係数から採る。ここだけ独自の係数を
 * 持つと、乗り換えが発火しなかったときに正解サイズが候補一覧へ入らない倍率
 * （実測では 4 倍・6 倍細かい格子）が生まれる。
 */
const harmonicOutHeights = (outH: number): number[] => {
	const factors = BOUNDARY_CONTRAST_LIMITS.harmonicFactors;
	const heights: number[] = [];
	for (let index = factors.length - 1; index >= 0; index -= 1) {
		heights.push(Math.round(outH / factors[index]));
	}
	for (let index = 0; index < factors.length; index += 1) {
		heights.push(outH * factors[index]);
	}
	return heights;
};

/**
 * 境界コントラストだけを 1 刻みで走査し、証拠が最も強い出力高さを返す。
 *
 * [Intended] 再構成誤差の走査は候補ごとにダウンサンプリングが要るため刻みを粗くしてあるが、
 * 境界コントラストのピークは正解セル幅で鋭く立つので、粗い刻みでは飛び越えてしまう。
 * この指標は軸プロファイルの走査だけで求まり、ダウンサンプリングを伴わないので
 * 全高さを 1 刻みで見ても負荷が小さい。
 */
const scanBoundaryEvidence = (
	croppedW: number,
	croppedH: number,
	ratio: number,
	outHMin: number,
	outHMax: number,
	boundaryContrast: BoundaryContrastEvaluator,
): {
	bestOutH: number;
	bestEvidence: number;
	scores: Float64Array;
	outHMin: number;
} => {
	let bestOutH = 0;
	const scores = new Float64Array(Math.max(0, outHMax - outHMin + 1));
	for (let outH = outHMin; outH <= outHMax; outH += 1) {
		const outW = Math.max(2, Math.round(outH * ratio));
		const cellW = croppedW / outW;
		const cellH = croppedH / outH;
		if (!(cellW > 1 && cellH > 1)) continue;
		scores[outH - outHMin] = boundaryContrast(cellW, cellH);
	}
	// [Intended] 最大値そのものを採る。正しい格子の 2 倍粗い読み方は境界がすべて実エッジに
	// 乗るため証拠がほぼ並ぶので、「同等なら粗い方」にすると正解を機械的に半分にしてしまう
	// （実測: 24x32 の合成スプライトが 12x16 になった）。粗い側へ倒すかどうかは、
	// 再構成との優位比で判断する findCoarserHarmonic だけが決める。
	// ただし範囲は minOverrideOutH 以上に限る。数セルしか無い格子は偶然の一致で
	// 跳ね上がるため（実測: 8x8 が正解の fixture で 2x2 が最大値を取る）、そこを含めた
	// 最大値は「入力に格子があるか」の判断材料にならない。
	let bestEvidence = 0;
	for (let index = 0; index < scores.length; index += 1) {
		const outH = outHMin + index;
		if (outH < BOUNDARY_CONTRAST_LIMITS.minOverrideOutH) continue;
		if (scores[index] > bestEvidence) {
			bestOutH = outH;
			bestEvidence = scores[index];
		}
	}
	return { bestOutH, bestEvidence, scores, outHMin };
};

type BoundaryEvidenceScan = ReturnType<typeof scanBoundaryEvidence>;

const evidenceAt = (scan: BoundaryEvidenceScan, outH: number): number => {
	const index = outH - scan.outHMin;
	return index >= 0 && index < scan.scores.length ? scan.scores[index] : 0;
};

/**
 * 再構成が選んだ格子が、より粗い倍音の過分割になっていないか調べる。
 * 見つかればその倍音の出力高さ、無ければ 0 を返す。
 *
 * [Intended] 倍音の位置は端数やトリミング位置で数行ずれるため、厳密な整数比ではなく
 * 各倍音の周囲を窓で探す。粗い倍音から順に見て、最初に条件を満たしたものを採る。
 */
const findCoarserHarmonic = (
	scan: BoundaryEvidenceScan,
	reconOutH: number,
	reconEvidence: number,
	outHMax: number,
): number => {
	const factors = BOUNDARY_CONTRAST_LIMITS.harmonicFactors;
	for (let index = factors.length - 1; index >= 0; index -= 1) {
		const center = reconOutH / factors[index];
		if (center < BOUNDARY_CONTRAST_LIMITS.minOverrideOutH) continue;
		const radius = Math.max(
			1,
			center * BOUNDARY_CONTRAST_LIMITS.harmonicWindow,
		);
		// [Intended] 窓の下端にも minOverrideOutH を掛ける。中心だけを見ていると、
		// 中心が下限ちょうどの倍音で窓が下限を割り、周期の繰り返しが足りない
		// 出力高さが乗り換え先に選ばれる。
		const from = Math.max(
			scan.outHMin,
			BOUNDARY_CONTRAST_LIMITS.minOverrideOutH,
			Math.round(center - radius),
		);
		const to = Math.min(outHMax, Math.round(center + radius));
		let bestOutH = 0;
		let bestEvidence = 0;
		for (let outH = from; outH <= to; outH += 1) {
			const evidence = evidenceAt(scan, outH);
			if (evidence > bestEvidence) {
				bestEvidence = evidence;
				bestOutH = outH;
			}
		}
		if (
			bestOutH > 0 &&
			bestEvidence >= BOUNDARY_CONTRAST_LIMITS.minEvidence &&
			bestEvidence >= reconEvidence * BOUNDARY_CONTRAST_LIMITS.overrideRatio
		) {
			return bestOutH;
		}
	}
	return 0;
};

/**
 * 採用したセル寸法のまま、境界がもっとも揃う位相を 1px 刻みで探す。
 * 位相はコンテンツ BBox の左上を 0 とした画素数で返し、証拠が薄い軸は null を返す。
 *
 * [Intended] セル寸法はコンテンツ BBox の幅・高さから割り出すのに、投影は
 * キャンバス左上を起点にしていたため、BBox 開始位置の端数だけ格子がずれていた。
 * ずれた格子ではどのセルも隣のドットを食うので、代表色が混色へ寄る（実測:
 * 20x18 が正解の 1254x1254 生成画像で x が 1/6 セルずれ、輪郭とハイライトが
 * にじんだ）。倍率を選んだ根拠である境界コントラストは BBox 起点で測っているので、
 * 位相もその指標で決めて投影と食い違わないようにする。
 */
const findAxisPhase = (
	contrast: (cell: number, phase?: number) => number,
	cell: number,
): number | null => {
	if (cell < BOUNDARY_CONTRAST_LIMITS.minPhaseCellPixels) return null;
	let bestPhase = 0;
	let bestContrast = contrast(cell, 0);
	// 位相 0 とセル幅ちょうどは同じ格子なので、走査は 1 〜 ceil(cell)-1 で足りる。
	for (let phase = 1; phase < Math.ceil(cell); phase += 1) {
		const value = contrast(cell, phase);
		if (value > bestContrast) {
			bestContrast = value;
			bestPhase = phase;
		}
	}
	return bestContrast >= BOUNDARY_CONTRAST_LIMITS.minPhaseEvidence
		? bestPhase
		: null;
};

const measurePhase = (
	axes: AxisBoundaryContrastEvaluator,
	cellW: number,
	cellH: number,
): { offsetX: number; offsetY: number; phaseMeasured: boolean } => {
	const phaseX = findAxisPhase(axes.x, cellW);
	const phaseY = findAxisPhase(axes.y, cellH);
	// [Policy] 片方の軸しか読めていないときは位相を採らない。読めた軸だけ動かすと
	// もう一方はキャンバス起点のまま残り、どちらの根拠とも合わない格子になる。
	if (phaseX === null || phaseY === null) {
		return { offsetX: 0, offsetY: 0, phaseMeasured: false };
	}
	return { offsetX: phaseX, offsetY: phaseY, phaseMeasured: true };
};

const outputWidthsForHeight = (outH: number, ratio: number): number[] => {
	const rounded = Math.max(2, Math.round(outH * ratio));
	const roundedUp = Math.max(2, Math.ceil(outH * ratio));
	// [Intended] 小さな出力では幅 1px の差が論理セルの倍率へ大きく影響するため、
	// 切り上げ候補も評価する。大きな出力では丸め誤差が相対的に小さく、
	// 候補を増やすと別の高解像度格子を誤採用しやすい。
	return rounded === roundedUp ||
		outH > TRIMMED_GRID_SEARCH_LIMITS.aspectAdjustedMaxOutputHeight
		? [rounded]
		: [rounded, roundedUp];
};

/**
 * 候補サイズをある程度「分散」させるため、outH の範囲をバケットに分け、各バケットから最良候補を選ぶ。
 * - スケールが大きく異なっても、互いに近すぎない候補を得られる。
 * - 採用格子とその倍音は必ず含め、不足分はスコア順に補う。
 *
 * [Intended] バケットは outH の対数で切る。線形に切ると、セル 4px 側の候補が
 * 大半のバケットを占め、粗い側（セル 20〜64px）が 1 バケットへ潰れる。
 * 人がサイズを選ぶときの感覚も倍率＝対数なので、対数軸のほうが選択肢として自然。
 */
const pickDistributedGridSizeCandidates = (
	results: GridSizeCandidate[],
	count: number,
	best: GridSizeCandidate,
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

	const logMin = Math.log(Math.max(1, minOutH));
	const logRange = Math.log(Math.max(1, maxOutH)) - logMin;
	const bucketCount = Math.min(count, maxOutH - minOutH + 1);
	const bucketBest: (GridSizeCandidate | null)[] = Array.from(
		{ length: bucketCount },
		() => null,
	);

	for (const r of byScore) {
		const t = logRange <= 0 ? 0 : (Math.log(r.outH) - logMin) / logRange;
		const b = Math.min(
			bucketCount - 1,
			Math.max(0, Math.floor(t * bucketCount)),
		);
		const cur = bucketBest[b];
		if (!cur || r.score < cur.score) bucketBest[b] = r;
	}

	const selected: GridSizeCandidate[] = [];
	const seen = new Set<string>();
	const add = (candidate: GridSizeCandidate): boolean => {
		const key = `${candidate.outW}x${candidate.outH}`;
		if (seen.has(key)) return false;
		selected.push(candidate);
		seen.add(key);
		return true;
	};

	// 採用格子は常に含める
	add(best);

	// [Intended] 採用格子の倍音は必ず選択肢へ入れる。倍率の取り違えは
	// ほぼ倍音関係で起きるので、候補選択で救えるのはこの兄弟が並んでいるときだけ。
	const harmonics = harmonicOutHeights(best.outH);
	for (let index = 0; index < harmonics.length; index += 1) {
		const target = harmonics[index];
		let nearest: GridSizeCandidate | null = null;
		for (const r of byScore) {
			if (
				nearest === null ||
				Math.abs(r.outH - target) < Math.abs(nearest.outH - target)
			) {
				nearest = r;
			}
		}
		// 近い候補が無い倍音は飛ばす（探索範囲外の倍率）。
		if (
			nearest &&
			Math.abs(nearest.outH - target) <=
				Math.max(1, target * BOUNDARY_CONTRAST_LIMITS.harmonicWindow)
		) {
			add(nearest);
		}
	}

	for (const r of bucketBest) {
		if (selected.length >= count) break;
		if (r) add(r);
	}

	// 空きがあれば、他の候補をスコア順に追加する
	for (const r of byScore) {
		if (selected.length >= count) break;
		add(r);
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
		const croppedData = cropped.data;
		const croppedW = cropped.width;
		const croppedH = cropped.height;
		const maskData = mask.data;

		const allResults: GridSizeCandidate[] = [];

		for (let outH = outHMin; outH <= outHMax; outH += outHStep) {
			const widths = outputWidthsForHeight(outH, ratio);
			for (let widthIndex = 0; widthIndex < widths.length; widthIndex += 1) {
				const outW = widths[widthIndex];
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
				const complexityPenalty =
					TRIMMED_GRID_SEARCH_WEIGHTS.complexityPenalty *
					Math.sqrt(outW * outH);
				const score = reconErr + complexityPenalty;
				allResults.push({ outH, outW, score });
			}
		}

		if (allResults.length === 0) return null;
		const best = bestByScore(allResults);
		const picked = pickDistributedGridSizeCandidates(
			allResults,
			GRID_SIZE_CANDIDATE_COUNT,
			best,
		);
		// [Policy] 境界コントラストはここでは付けない。候補ごとの値は採用格子の決定にも
		// 警告にも使われず、走査コストだけが残る。曖昧さの判定に使う値は search() が
		// scanBoundaryEvidence から 1 刻みで求める。
		return {
			bestOutH: best.outH,
			est: {
				outW: best.outW,
				outH: best.outH,
				cellW: croppedW / best.outW,
				cellH: croppedH / best.outH,
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
		signalOptions?: Partial<GridSignalOptions>,
	): GridEstimateFromTrimmed | null {
		// 比率に基づいて outH を変化させ、outW を決定する（探索空間を制限する）
		const outHMin = Math.max(
			2,
			Math.floor(
				cropped.height / TRIMMED_GRID_SEARCH_LIMITS.reconstructionMaxCellPixels,
			),
		);
		// [Intended] 境界コントラストだけは、より粗いセルまで見る。再構成側の下限を
		// 広げると複雑度ペナルティの釣り合いが変わって既存の判断まで動くため、
		// 探索範囲の拡張は「乗り換え先を見つける」用途に限る。
		const evidenceOutHMin = Math.max(
			2,
			Math.floor(cropped.height / TRIMMED_GRID_SEARCH_LIMITS.maxCellPixels),
		);
		// 1 セルが小さすぎる（= 過分割）と誤差は常に下がるため、最小セル幅を要求する
		const outHMax = Math.min(
			512,
			Math.max(
				outHMin,
				Math.floor(cropped.height / TRIMMED_GRID_SEARCH_LIMITS.minCellPixels),
			),
		);
		const axisContrast = createAxisBoundaryContrastEvaluator(
			cropped,
			mask,
			signalOptions,
		);
		const boundaryContrast: BoundaryContrastEvaluator = (cellW, cellH) =>
			Math.sqrt(axisContrast.x(cellW) * axisContrast.y(cellH));
		const ratio = cropped.width / Math.max(1, cropped.height);

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
			// [Intended] ヒント経路では境界コントラストを付けない。窓の中の最大値は
			// 「入力に格子があるか」を表す全域の最大値とは意味が違い、曖昧さの
			// しきい値もそちらの分布で決めてある。利用者が出力サイズを指定している
			// 経路で、意味の違う値を根拠に警告を出さない。
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

		// [Intended] 再構成誤差はセルを細かくするほど下がるので、正解の 2〜6 倍細かい
		// 格子を選んでしまうことがある（実測: AI 生成のドット絵風画像 4 枚すべて）。
		// 粗い側の倍音が明確に境界へ乗っているときだけ、そちらへ乗り換える。
		// 乗り換え後の 1px 単位の詰めは、端数に強い再構成誤差へ戻して任せる。
		const evidence = scanBoundaryEvidence(
			cropped.width,
			cropped.height,
			ratio,
			evidenceOutHMin,
			outHMax,
			boundaryContrast,
		);
		const reconEvidence = evidenceAt(evidence, coarse.bestOutH);
		const harmonicOutH = findCoarserHarmonic(
			evidence,
			coarse.bestOutH,
			reconEvidence,
			outHMax,
		);
		const refineCenter = harmonicOutH > 0 ? harmonicOutH : coarse.bestOutH;
		const refineRadius =
			harmonicOutH > 0 ? BOUNDARY_CONTRAST_LIMITS.refineRadius : outHStep * 2;
		// [Policy] 乗り換えたときだけ拡張下限まで降りる。乗り換えない入力の再走査範囲を
		// 広げると、既存の入力で選ばれる格子が動いてしまう。
		const rangeFloor = harmonicOutH > 0 ? evidenceOutHMin : outHMin;
		const r0 = Math.max(rangeFloor, refineCenter - refineRadius);
		const r1 = Math.min(outHMax, refineCenter + refineRadius);
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
		// 候補リスト（UI でのサイズ調整用）には「粗い検索」の分散候補を使用する。
		// 最終的に採用するグリッドは「精密検索」の最良結果を維持する。
		const best = refined?.est ?? coarse.est;
		// [Intended] 採用した倍率と、境界がもっとも揃う倍率が食い違っているなら、
		// どちらを採るべきかは指標だけでは決まらない。利用者へ候補を出す根拠にする。
		const contested =
			evidence.bestOutH > 0 &&
			Math.abs(best.outH - evidence.bestOutH) >
				evidence.bestOutH * BOUNDARY_CONTRAST_LIMITS.contestedRatio;
		return {
			...best,
			...measurePhase(axisContrast, best.cellW, best.cellH),
			gridEvidence: evidenceAt(evidence, best.outH),
			gridEvidenceMax: evidence.bestEvidence,
			gridEvidenceContested: contested,
			candidates: coarse.est.candidates,
		};
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

	const allResults: GridSizeCandidate[] = [];

	const h0 = hint ? Math.max(outHMin, hint.outH - 12) : outHMin;
	const h1 = hint ? Math.min(outHMax, hint.outH + 12) : outHMax;

	for (let outH = h0; outH <= h1; outH += 1) {
		const widths = outputWidthsForHeight(outH, ratio);
		for (let widthIndex = 0; widthIndex < widths.length; widthIndex += 1) {
			const outW = widths[widthIndex];
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
			const complexityPenalty =
				TRIMMED_GRID_SEARCH_WEIGHTS.complexityPenalty * Math.sqrt(outW * outH);
			const score = reconErr + complexityPenalty;
			allResults.push({ outH, outW, score });
		}
	}

	if (allResults.length === 0) return null;
	let best = allResults[0];
	for (let index = 1; index < allResults.length; index += 1) {
		if (allResults[index].score < best.score) best = allResults[index];
	}
	const picked = pickDistributedGridSizeCandidates(
		allResults,
		GRID_SIZE_CANDIDATE_COUNT,
		best,
	);
	return {
		outW: best.outW,
		outH: best.outH,
		cellW: cropped.width / best.outW,
		cellH: cropped.height / best.outH,
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
