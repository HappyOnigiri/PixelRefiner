import { BOUNDARY_CONTRAST_LIMITS } from "../../shared/config";
import type { AxisBoundaryContrastEvaluator } from "./boundary-contrast";

/**
 * 与えたセル寸法のまま、境界がもっとも揃う位相を 1px 刻みで探す。
 * 位相はコンテンツ BBox の左上を 0 とした画素数で返し、証拠が薄い軸は null を返す。
 *
 * [Intended] セル寸法はコンテンツ BBox の幅・高さから割り出すのに、投影は
 * キャンバス左上を起点にしていたため、BBox 開始位置の端数だけ格子がずれていた。
 * ずれた格子ではどのセルも隣のドットを食うので、代表色が混色へ寄る（実測:
 * 20x18 が正解の 1254x1254 生成画像で x が 1/6 セルずれ、輪郭とハイライトが
 * にじんだ）。倍率を選んだ根拠である境界コントラストは BBox 起点で測っているので、
 * 位相もその指標で決めて投影と食い違わないようにする。
 */
export const findAxisPhase = (
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

export type PhaseConfirmedSize = {
	outW: number;
	outH: number;
	cellW: number;
	cellH: number;
	phaseX: number;
	phaseY: number;
	evidence: number;
};

/**
 * 両軸とも位相を読み取れた倍率のうち、境界コントラストがもっとも強いものを返す。
 *
 * サイズ走査は位相 0 の再構成誤差だけで倍率を比べるため、格子がキャンバスの縁から
 * 半端な位置で始まる入力では正解の倍率こそ誤差が悪くなる。位相まで含めて測り直す
 * 価値のある倍率を、境界コントラストだけを根拠に 1 つ指名する。
 *
 * [Intended] 両軸とも位相が読めた倍率だけを見る。片方でも読めない倍率は、格子の
 * 位置を決める根拠が無く、位相をずらせば誤差が上がるだけなので拾わない。
 * [Intended] 位相 0 の倍率も対象にする。位相が 0 でも粗い刻みの走査点から外れていれば
 * 一度も測られていない（実測: 2752x1322 の領域で正解 256x123 は位相 (0,0) だが、
 * 走査点が 41 から 3 刻みなので 122 と 125 しか見ていない）。
 * [Policy] 返すのは最強の 1 件だけにする。再構成誤差はセルを細かくするほど下がるので、
 * 証拠の弱い倍率まで誤差で選べるようにすると過分割へ戻る（実測: 正解セル 24px に 8px の
 * 濃淡を敷いた合成画像で、3 倍細かい格子が誤差では勝つ）。過分割を退ける指標は
 * 境界コントラストのほうなので、倍率の指名はそちらだけに決めさせる。
 * [Policy] 数セルしか無い倍率は対象外にする。境界コントラストが偶然の一致で跳ね上がり、
 * 誤差比較まで通ってしまう（実測: 24x24・正解セル 4px の fixture で、2 倍粗い 3x3 が
 * 位相 (4,1) で選ばれた）。しきい値は粗い倍音への乗り換えと同じ minOverrideOutH を使う。
 */
export const findPhaseConfirmedSize = (
	croppedW: number,
	croppedH: number,
	outHMin: number,
	outHMax: number,
	widthsForHeight: (outH: number) => number[],
	axes: AxisBoundaryContrastEvaluator,
): PhaseConfirmedSize | null => {
	let selected: PhaseConfirmedSize | null = null;
	for (let outH = outHMin; outH <= outHMax; outH += 1) {
		if (outH < BOUNDARY_CONTRAST_LIMITS.minOverrideOutH) continue;
		const cellH = croppedH / outH;
		const phaseY = findAxisPhase(axes.y, cellH);
		if (phaseY === null) continue;
		const widths = widthsForHeight(outH);
		for (let index = 0; index < widths.length; index += 1) {
			const outW = widths[index];
			if (outW < BOUNDARY_CONTRAST_LIMITS.minOverrideOutH) continue;
			const cellW = croppedW / outW;
			if (!(cellW > 1 && cellH > 1)) continue;
			const phaseX = findAxisPhase(axes.x, cellW);
			if (phaseX === null) continue;
			const evidence = Math.sqrt(axes.x(cellW, phaseX) * axes.y(cellH, phaseY));
			// 同値なら粗い側を残す。細かい側は倍音として同じ境界へ乗るだけで、
			// 証拠が並んだ時点でどちらとも決められない。
			if (selected !== null && evidence <= selected.evidence) continue;
			selected = { outW, outH, cellW, cellH, phaseX, phaseY, evidence };
		}
	}
	return selected;
};
