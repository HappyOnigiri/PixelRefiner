import { BOUNDARY_CONTRAST_LIMITS } from "../../shared/config";
import type { BoundaryContrastEvaluator } from "./boundary-contrast";

export type BoundaryEvidenceScan = {
	bestOutH: number;
	bestEvidence: number;
	scores: Float64Array;
	outHMin: number;
};

/**
 * 境界コントラストだけを 1 刻みで走査し、証拠が最も強い出力高さを返す。
 *
 * [Intended] 再構成誤差の走査は候補ごとにダウンサンプリングが要るため刻みを粗くしてあるが、
 * 境界コントラストのピークは正解セル幅で鋭く立つので、粗い刻みでは飛び越えてしまう。
 * この指標は軸プロファイルの走査だけで求まり、ダウンサンプリングを伴わないので
 * 全高さを 1 刻みで見ても負荷が小さい。
 */
export const scanBoundaryEvidence = (
	croppedW: number,
	croppedH: number,
	ratio: number,
	outHMin: number,
	outHMax: number,
	boundaryContrast: BoundaryContrastEvaluator,
): BoundaryEvidenceScan => {
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

export const evidenceAt = (
	scan: BoundaryEvidenceScan,
	outH: number,
): number => {
	const index = outH - scan.outHMin;
	return index >= 0 && index < scan.scores.length ? scan.scores[index] : 0;
};

/**
 * 再構成が選んだ格子が、より粗い倍音の過分割になっていないか調べる。
 * 見つかればその倍音の出力高さ、無ければ 0 を返す。
 *
 * [Intended] 倍音の位置は端数やトリミング位置で数行ずれるため、厳密な整数比ではなく
 * 各倍音の周囲を窓で探す。
 * [Intended] 条件を満たす倍音のうち、境界コントラストが最も強いものを採る。粗い側から
 * 順に見て最初に条件を満たしたものを採ると、正解の 1 オクターブ下で止まってしまう
 * （実測: 100x100 ドットの 2048px 生成画像で、再構成が 3 倍細かい 255 を選び、
 * 6 倍音の窓にある 42（証拠 2.68）で確定して、正解 85（証拠 3.63）を一度も見なかった）。
 * 倍音同士の比較は同じ指標・同じ窓幅で行うので、しきい値を通ったあとは最大値でよい。
 * 同値なら細かい側を残す。粗い側へ倒すと正解を機械的に半分にしてしまうためで、
 * これは scanBoundaryEvidence の最大値の採り方と同じ理由による。
 */
export const findCoarserHarmonic = (
	scan: BoundaryEvidenceScan,
	reconOutH: number,
	reconEvidence: number,
	outHMax: number,
): number => {
	const factors = BOUNDARY_CONTRAST_LIMITS.harmonicFactors;
	let selectedOutH = 0;
	let selectedEvidence = 0;
	// 細かい倍音（小さい factor）から順に見る。同値では先に見たものを残すので、
	// 走査順がそのまま「同値なら細かい側」になる。
	for (let index = 0; index < factors.length; index += 1) {
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
			bestEvidence >= reconEvidence * BOUNDARY_CONTRAST_LIMITS.overrideRatio &&
			bestEvidence > selectedEvidence
		) {
			selectedOutH = bestOutH;
			selectedEvidence = bestEvidence;
		}
	}
	return selectedOutH;
};

/**
 * 境界コントラストの山のうち、粗い走査が素通りした出力高さを、証拠の強い順に返す。
 *
 * [Intended] 山の頂だけを返す。しきい値を超えた点をそのまま並べると、幅のある山の
 * 裾で候補が埋まり、別の倍率の山まで届かない。
 */
export const findSkippedEvidencePeaks = (
	scan: BoundaryEvidenceScan,
	minEvidence: number,
	scannedByCoarse: (outH: number) => boolean,
	limit: number,
): number[] => {
	const peaks: Array<{ outH: number; evidence: number }> = [];
	for (let index = 0; index < scan.scores.length; index += 1) {
		const outH = scan.outHMin + index;
		if (outH < BOUNDARY_CONTRAST_LIMITS.minOverrideOutH) continue;
		const evidence = scan.scores[index];
		if (evidence < minEvidence) continue;
		const previous = index > 0 ? scan.scores[index - 1] : 0;
		const next = index + 1 < scan.scores.length ? scan.scores[index + 1] : 0;
		if (evidence < previous || evidence < next) continue;
		if (scannedByCoarse(outH)) continue;
		peaks.push({ outH, evidence });
	}
	peaks.sort((a, b) => b.evidence - a.evidence || a.outH - b.outH);
	const selected: number[] = [];
	for (let index = 0; index < peaks.length && index < limit; index += 1) {
		selected.push(peaks[index].outH);
	}
	return selected;
};
