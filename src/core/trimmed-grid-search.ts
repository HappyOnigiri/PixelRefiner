import {
	BOUNDARY_CONTRAST_LIMITS,
	clampInt,
	TRIMMED_GRID_SEARCH_LIMITS,
	TRIMMED_GRID_SEARCH_WEIGHTS,
} from "../shared/config";
import type { GridSignalOptions, PixelGrid, RawImage } from "../shared/types";
import {
	type AxisBoundaryContrastEvaluator,
	combineAxisContrast,
	createAxisBoundaryContrastEvaluator,
} from "./grid-signals/boundary-contrast";
import {
	evidenceAt,
	findCoarserHarmonic,
	findSkippedEvidencePeaks,
	scanBoundaryEvidence,
} from "./grid-signals/boundary-evidence";
import {
	findAxisPhase,
	findPhaseConfirmedSize,
} from "./grid-signals/grid-phase";
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
		boundaryContrastOverride?: boolean,
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
 * 採用格子でセル代表色を取り、元画像との平均絶対誤差を測る。
 * 背景マスクが透けている画素は評価から外し、評価点が無ければ null を返す。
 *
 * [Intended] 候補数が多い探索では計算量を抑えるため互換サンプラーで再構成誤差を近似する。
 */
const measureReconstructionError = (
	cropped: RawImage,
	mask: RawImage,
	grid: PixelGrid,
	sampleWindow: number,
	pixelStride: number,
): number | null => {
	const croppedData = cropped.data;
	const croppedW = cropped.width;
	const croppedH = cropped.height;
	const maskData = mask.data;
	const cropX = grid.cropX ?? 0;
	const cropY = grid.cropY ?? 0;
	const outW = grid.outW ?? 1;
	const outH = grid.outH ?? 1;
	const small = downsample(cropped, grid, sampleWindow);
	const smallData = small.data;
	let err = 0;
	let n = 0;
	for (let y = 0; y < croppedH; y += pixelStride) {
		const rowOffset = y * croppedW;
		for (let x = 0; x < croppedW; x += pixelStride) {
			const pixelIdx = rowOffset + x;
			if (maskData[pixelIdx * 4 + 3] < 16) continue;

			const i = Math.min(
				outW - 1,
				Math.max(0, Math.floor((x - cropX) / grid.cellW)),
			);
			const j = Math.min(
				outH - 1,
				Math.max(0, Math.floor((y - cropY) / grid.cellH)),
			);
			const srcIdx = pixelIdx * 4;
			const dstIdx = (j * outW + i) * 4;
			err +=
				Math.abs(croppedData[srcIdx] - smallData[dstIdx]) +
				Math.abs(croppedData[srcIdx + 1] - smallData[dstIdx + 1]) +
				Math.abs(croppedData[srcIdx + 2] - smallData[dstIdx + 2]);
			n += 1;
		}
	}
	return n === 0 ? null : err / n;
};

/** 位相を与えたときに、その格子でセル代表色を取るための投影を組む。 */
const gridForPhase = (
	width: number,
	height: number,
	cellW: number,
	cellH: number,
	phaseX: number,
	phaseY: number,
): PixelGrid => {
	// 位相をずらした格子は画像左端の手前から始まるので、被覆は切り上げで数える。
	const cropX = phaseX > 0 ? phaseX - cellW : 0;
	const cropY = phaseY > 0 ? phaseY - cellH : 0;
	return {
		cellW,
		cellH,
		offsetX: phaseX,
		offsetY: phaseY,
		outW: Math.max(1, Math.ceil((width - cropX) / cellW)),
		outH: Math.max(1, Math.ceil((height - cropY) / cellH)),
		cropX,
		cropY,
		cropW: width,
		cropH: height,
		score: 0,
	};
};

const measurePhase = (
	axes: AxisBoundaryContrastEvaluator,
	cellW: number,
	cellH: number,
	reconstructionError: (grid: PixelGrid) => number | null,
	cropped: RawImage,
): { offsetX: number; offsetY: number; phaseMeasured: boolean } => {
	const phaseX = findAxisPhase(axes.x, cellW);
	const phaseY = findAxisPhase(axes.y, cellH);
	// [Policy] 片方の軸しか読めていないときは位相を採らない。読めた軸だけ動かすと
	// もう一方はキャンバス起点のまま残り、どちらの根拠とも合わない格子になる。
	if (phaseX === null || phaseY === null) {
		return { offsetX: 0, offsetY: 0, phaseMeasured: false };
	}
	// 位相 0 は「BBox の縁でちょうど境界が合っている」という結論なので、
	// 投影は BBox 起点へ寄せたまま、セル内のずらしだけを持たない。
	const aligned = { offsetX: 0, offsetY: 0, phaseMeasured: true };
	if (phaseX === 0 && phaseY === 0) return aligned;
	// [Intended] 境界コントラストが最大の位相は、必ずしも正しい境界とは限らない。
	// セル内部の輪郭やハイライトが同じ位置に並ぶ画像では、真の境界より内部の線が
	// 強く出て位相が数 px ずれる（実測: セル 10px でセル内 localX=3 に線を置いた
	// 合成画像で、倍率は 8x8 を正しく選びながら位相が 3 と読まれた）。位相をずらした
	// ほうがセル代表色の再構成誤差も下がることを確かめてから採用する。
	const shifted = reconstructionError(
		gridForPhase(cropped.width, cropped.height, cellW, cellH, phaseX, phaseY),
	);
	const unshifted = reconstructionError(
		gridForPhase(cropped.width, cropped.height, cellW, cellH, 0, 0),
	);
	if (shifted === null || unshifted === null || shifted >= unshifted) {
		return aligned;
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

/** 再構成誤差に、セル数へ比例する複雑度ペナルティを足した採用スコア。 */
const gridSizeScore = (
	reconstructionError: number,
	outW: number,
	outH: number,
): number =>
	reconstructionError +
	TRIMMED_GRID_SEARCH_WEIGHTS.complexityPenalty * Math.sqrt(outW * outH);

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
		const croppedW = cropped.width;
		const croppedH = cropped.height;

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
				const reconErr = measureReconstructionError(
					cropped,
					mask,
					grid,
					sampleWindow,
					pixelStride,
				);
				if (reconErr === null) continue;

				// 再構成誤差は過分割で単調に下がりやすいため、セル数に比例するペナルティを加える。
				// 低解像度（少ないセル）と高解像度（多いセル）のバランスを取るため、平方根オーダーを使用する。
				const score = gridSizeScore(reconErr, outW, outH);
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
		boundaryContrastOverride = true,
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
		const boundaryContrast = combineAxisContrast(axisContrast);
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
		// [Intended] 乗り換えを切っても、曖昧さの判定に使う境界コントラストの値は
		// そのまま返す。候補選択の提示条件は採用格子の決め方とは別の判断だから。
		const harmonicOutH = boundaryContrastOverride
			? findCoarserHarmonic(evidence, coarse.bestOutH, reconEvidence, outHMax)
			: 0;
		const refineCenter = harmonicOutH > 0 ? harmonicOutH : coarse.bestOutH;
		const refineRadius =
			harmonicOutH > 0 ? BOUNDARY_CONTRAST_LIMITS.refineRadius : outHStep * 2;
		// [Policy] 乗り換えたときだけ拡張下限まで降りる。乗り換えない入力の再走査範囲を
		// 広げると、既存の入力で選ばれる格子が動いてしまう。
		const rangeFloor = harmonicOutH > 0 ? evidenceOutHMin : outHMin;
		const r0 = Math.max(rangeFloor, refineCenter - refineRadius);
		const r1 = Math.min(outHMax, refineCenter + refineRadius);
		const finePixelStride = Math.max(1, Math.floor(pixelStride / 2));
		const refined = this.scan(
			cropped,
			mask,
			sampleWindow,
			r0,
			r1,
			1,
			finePixelStride,
		);
		// 注記:
		// 候補リスト（UI でのサイズ調整用）には「粗い検索」の分散候補を使用する。
		// 最終的に採用するグリッドは「精密検索」の最良結果を維持する。
		let best = refined?.est ?? coarse.est;
		// [Intended] 粗い刻みは正解の出力高さをまたぐことがある。1 ドットが大きく描かれた
		// 入力では再構成誤差の谷が出力高さ 1 行ぶんしか無く、隣を見ても手掛かりが残らない
		// （実測: 100x100 ドットの 2048px 生成画像で、被写体 BBox 1231x1744 に対し
		// outHMin=54・刻み 3 の走査点が 84 と 87 になり、正解 85 の谷（誤差 24.2、
		// 隣は 63.6 と 69.2）を素通りした）。境界コントラストは 1 刻みで見ているので、
		// 走査から漏れた山を再走査の中心として使う。
		// [Intended] 最大の山だけでは足りない。市松の合成画像では正解の 1 オクターブ下が
		// 全域の最大になり、正解は 2 番目以降の山になる（実測: 540x540・セル 30px で
		// 出力 9 の証拠 31.7 が最大、正解 18 はその次）。乗り換え先が倍音関係に無い
		// ときの受け皿でもあるので、強い順に数個ぶん見る。
		if (boundaryContrastOverride) {
			const scannedByCoarse = (outH: number): boolean =>
				(outH >= r0 && outH <= r1) ||
				(outH >= outHMin &&
					outH <= outHMax &&
					(outH - outHMin) % outHStep === 0);
			const peaks = findSkippedEvidencePeaks(
				evidence,
				Math.max(
					BOUNDARY_CONTRAST_LIMITS.minEvidence,
					reconEvidence * BOUNDARY_CONTRAST_LIMITS.overrideRatio,
				),
				scannedByCoarse,
				BOUNDARY_CONTRAST_LIMITS.skippedPeakCandidates,
			);
			for (let index = 0; index < peaks.length; index += 1) {
				const peak = peaks[index];
				// [Policy] 山を根拠に動かすのは粗い側だけ。再構成誤差は細かいほど下がるので、
				// 細かい側の山へ降りると誤差比較が必ずそちらへ倒れる。境界コントラストが
				// 正解の 2 倍細かい格子で最大になる入力があり（実測: 輪郭のぼけた
				// 2816x1536 と 1254x1254 の生成画像で、正解 22x21 / 33x47 の証拠 1.00 /
				// 1.05 に対し 2 倍細かい格子が 1.52 / 1.53）、そこでは乗り換えが害になる。
				if (peak >= best.outH) continue;
				const atPeak = this.scan(
					cropped,
					mask,
					sampleWindow,
					Math.max(
						evidenceOutHMin,
						peak - BOUNDARY_CONTRAST_LIMITS.refineRadius,
					),
					Math.min(outHMax, peak + BOUNDARY_CONTRAST_LIMITS.refineRadius),
					1,
					finePixelStride,
				);
				// [Policy] 採否は再構成誤差に決めさせる。境界コントラストは走査から漏れた
				// 位置を教えるだけで、そこまでの最良より誤差が下がらなければ乗り換えない。
				if (
					atPeak &&
					(atPeak.est.score ?? Number.POSITIVE_INFINITY) <
						(best.score ?? Number.POSITIVE_INFINITY)
				) {
					best = atPeak.est;
				}
			}
		}
		const reconstructionErrorAtPhase = (
			cellW: number,
			cellH: number,
			phaseX: number,
			phaseY: number,
		): { score: number; outW: number; outH: number } | null => {
			const grid = gridForPhase(
				cropped.width,
				cropped.height,
				cellW,
				cellH,
				phaseX,
				phaseY,
			);
			const error = measureReconstructionError(
				cropped,
				mask,
				grid,
				sampleWindow,
				finePixelStride,
			);
			if (error === null) return null;
			const outW = grid.outW ?? 1;
			const outH = grid.outH ?? 1;
			return { score: gridSizeScore(error, outW, outH), outW, outH };
		};
		// [Intended] ここまでの走査は、どの倍率も位相 0 の再構成誤差だけで比べている。
		// 格子がキャンバスの縁から半端な位置で始まる入力では、正解の倍率こそセルが
		// 隣のドットを食い、誤差が最悪の部類になって選ばれない（実測: 2752x1536 の
		// 生成画像でセル 10.75px・位相 6 が正解だが、位相 0 の誤差 35.7 は隣の倍率
		// 25.0 より悪く、採用は 3 倍粗い 93x52 まで流れた）。位相を読み取れた倍率
		// だけを拾い直し、同じ位相込みの尺度で採否を決める。
		// [Policy] 乗り換えを切った経路では働かせない。境界コントラストを根拠に倍率を
		// 動かす点は、粗い倍音への乗り換えや山の再走査と同じ性質の判断になる。
		const phaseConfirmed = boundaryContrastOverride
			? findPhaseConfirmedSize(
					cropped.width,
					cropped.height,
					outHMin,
					outHMax,
					(outH) => outputWidthsForHeight(outH, ratio),
					axisContrast,
				)
			: null;
		if (phaseConfirmed) {
			// [Policy] 比較条件を揃えるため、採用格子も位相込みで測り直す。位相 0 の
			// スコアと比べると、位相を測った倍率が一方的に有利になる。
			const bestPhased = reconstructionErrorAtPhase(
				best.cellW,
				best.cellH,
				findAxisPhase(axisContrast.x, best.cellW) ?? 0,
				findAxisPhase(axisContrast.y, best.cellH) ?? 0,
			);
			const bestScore = Math.min(
				best.score ?? Number.POSITIVE_INFINITY,
				bestPhased?.score ?? Number.POSITIVE_INFINITY,
			);
			const scored = reconstructionErrorAtPhase(
				phaseConfirmed.cellW,
				phaseConfirmed.cellH,
				phaseConfirmed.phaseX,
				phaseConfirmed.phaseY,
			);
			// [Policy] 採否は再構成誤差に決めさせる。境界コントラストは走査から漏れた
			// 倍率を教えるだけで、そこまでの最良より誤差が下がらなければ乗り換えない。
			if (scored && scored.score < bestScore) {
				best = {
					outW: phaseConfirmed.outW,
					outH: phaseConfirmed.outH,
					cellW: phaseConfirmed.cellW,
					cellH: phaseConfirmed.cellH,
					offsetX: phaseConfirmed.phaseX,
					offsetY: phaseConfirmed.phaseY,
					score: scored.score,
					phaseMeasured: true,
				};
			}
		}
		// [Intended] 採用した倍率と、境界がもっとも揃う倍率が食い違っているなら、
		// どちらを採るべきかは指標だけでは決まらない。利用者へ候補を出す根拠にする。
		const contested =
			evidence.bestOutH > 0 &&
			Math.abs(best.outH - evidence.bestOutH) >
				evidence.bestOutH * BOUNDARY_CONTRAST_LIMITS.contestedRatio;
		const reconstructionError = (grid: PixelGrid): number | null =>
			measureReconstructionError(
				cropped,
				mask,
				grid,
				sampleWindow,
				Math.max(1, Math.floor(pixelStride / 2)),
			);
		return {
			...best,
			...measurePhase(
				axisContrast,
				best.cellW,
				best.cellH,
				reconstructionError,
				cropped,
			),
			gridEvidence: evidenceAt(evidence, best.outH),
			gridEvidenceMax: evidence.bestEvidence,
			gridEvidenceContested: contested,
			// [Intended] 候補にも同じ手順で位相を載せる。採用格子だけに載せると、同じセル
			// 寸法の候補が位相 0 の別サイズとして残り、投影後のサイズが採用格子と食い違う。
			// 候補の再構成スコアも位相のずれた格子で測られ、比較条件が揃わない。
			candidates: coarse.est.candidates?.map((candidate) => ({
				...candidate,
				...measurePhase(
					axisContrast,
					candidate.cellW,
					candidate.cellH,
					reconstructionError,
					cropped,
				),
			})),
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
