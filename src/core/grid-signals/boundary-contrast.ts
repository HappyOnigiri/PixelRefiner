import { GRID_SIGNAL_DEFAULTS } from "../../shared/config";
import type { GridSignalOptions, RawImage } from "../../shared/types";
import { combineSignalProfiles, createAxisSignalProfiles } from "./profiles";

/**
 * 予測したセル境界の位置に、実際のエッジがどれだけ集まっているか。
 *
 * [Intended] 再構成誤差はセルを細かくするほど単調に下がるため、単独では
 * 「本当のセル幅」と「その 1/2・1/3」を区別できない。この指標は逆向きに効く。
 * 1/3 の格子では予測境界の 2/3 がセル内部の平坦な場所に落ちるので分子が薄まり、
 * 過分割が明確な減点になる。2 つを併せると失敗方向が互いに打ち消し合う。
 *
 * 戻り値は「境界位置の平均エッジ強度 ÷ 全位置の平均エッジ強度」で、
 * 1.0 が「境界に何の偏りも無い（格子の証拠なし）」を表す。
 */
const axisBoundaryContrast = (
	edges: Float64Array,
	cell: number,
	phase = 0,
): number => {
	if (!(cell > 0) || edges.length < 3) return 0;
	let boundarySum = 0;
	let boundaryCount = 0;
	// [Intended] 非整数のセル幅を扱うため、境界は丸めずに前後 1px の三角窓で拾う。
	// 位相は「最初の境界の位置」。0 のときは従来どおり cell から始める。
	const first = phase > 0 ? phase : cell;
	for (let boundary = first; boundary < edges.length - 1; boundary += cell) {
		const center = Math.round(boundary);
		let peak = 0;
		for (let delta = -1; delta <= 1; delta += 1) {
			const index = center + delta;
			if (index <= 0 || index >= edges.length - 1) continue;
			const weight = Math.max(0, 1 - Math.abs(boundary - index));
			const value = edges[index] * weight;
			if (value > peak) peak = value;
		}
		boundarySum += peak;
		boundaryCount += 1;
	}
	if (boundaryCount === 0) return 0;
	let total = 0;
	let count = 0;
	for (let index = 1; index < edges.length - 1; index += 1) {
		total += edges[index];
		count += 1;
	}
	if (count === 0 || total === 0) return 0;
	return boundarySum / boundaryCount / (total / count);
};

export type BoundaryContrastEvaluator = (
	cellW: number,
	cellH: number,
) => number;

/** 軸ごとに、セル幅と位相を指定して境界コントラストを測る。 */
export type AxisBoundaryContrastEvaluator = {
	x: (cell: number, phase?: number) => number;
	y: (cell: number, phase?: number) => number;
};

/**
 * 軸ごとのエッジプロファイルを 1 度だけ作り、セル寸法・位相ごとの境界コントラストを返す。
 * [Policy] プロファイル生成は画像 1 枚あたり 1 回で済ませる。候補ごとの計算は
 * 辺の長さに比例するだけなので、候補ごとのダウンサンプリングよりずっと軽い。
 */
export const createAxisBoundaryContrastEvaluator = (
	image: RawImage,
	mask: RawImage,
	signalOptions: Partial<GridSignalOptions> = {},
): AxisBoundaryContrastEvaluator => {
	if (image.width < 2 || image.height < 2) {
		return { x: () => 0, y: () => 0 };
	}
	// [Policy] エッジの合成はアンサンブル側と同じ設定に従う。ここだけ既定値で
	// 固定すると、呼び出し元が色境界などを切っても新指標だけが有効に残り、
	// 採用格子と警告に効いてしまう。
	const options: GridSignalOptions = {
		...GRID_SIGNAL_DEFAULTS,
		...signalOptions,
	};
	const profiles = createAxisSignalProfiles(image, mask);
	const xEdges = combineSignalProfiles(profiles.x, options);
	const yEdges = combineSignalProfiles(profiles.y, options);
	return {
		x: (cell, phase = 0) =>
			Math.max(0, axisBoundaryContrast(xEdges, cell, phase)),
		y: (cell, phase = 0) =>
			Math.max(0, axisBoundaryContrast(yEdges, cell, phase)),
	};
};

export const createBoundaryContrastEvaluator = (
	image: RawImage,
	mask: RawImage,
	signalOptions: Partial<GridSignalOptions> = {},
): BoundaryContrastEvaluator => {
	const axes = createAxisBoundaryContrastEvaluator(image, mask, signalOptions);
	return (cellW, cellH) =>
		// [Intended] 片方の軸だけ格子に乗っている状態を高く評価しないよう相乗平均を使う。
		Math.sqrt(axes.x(cellW) * axes.y(cellH));
};
