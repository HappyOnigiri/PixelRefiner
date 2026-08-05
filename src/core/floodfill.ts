import type { Connectivity, RawImage } from "../shared/types";

/**
 * なめらかな階調（グラデーション背景）をたどるための追加許容。
 *
 * 開始色との絶対差だけで判定すると、グラデーション背景は tolerance を超えた
 * ところで塗りつぶしが止まり、背景が残る。そこで「直前の画素からの差が小さい」
 * 場合も背景として通す。
 */
export type FloodFillRamp = {
	/**
	 * 隣接画素間で許容するチャンネル差。
	 * [Intended] 被写体との境界で必ず止めるため、この値は小さく保つ。なめらかな階調は
	 * 1 画素あたり数階調しか動かないが、被写体の輪郭では数十階調跳ねるので、
	 * 小さな段差だけを通すことがそのまま「被写体で止まる条件」になる。
	 */
	stepTolerance: number;
	/**
	 * 開始色から離れられるチャンネル差の上限。
	 * [Intended] 小さな段差の連鎖で無制限に色空間を歩かないための封じ込め。
	 */
	seedLimit: number;
};

const NEIGHBOR_OFFSETS_4: Array<[number, number]> = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
];

const NEIGHBOR_OFFSETS_8: Array<[number, number]> = [
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
	[-1, -1],
	[-1, 1],
	[1, -1],
	[1, 1],
];

export const floodFillTransparent = (
	img: RawImage,
	startX: number,
	startY: number,
	tolerance: number,
	visitedExternal?: Uint8Array,
	connectivity: Connectivity = "4",
	ramp?: FloodFillRamp,
): void => {
	const w = img.width;
	const h = img.height;
	if (startX < 0 || startY < 0 || startX >= w || startY >= h) {
		return;
	}
	const data = img.data;
	const seedOffset = (startY * w + startX) * 4;
	const seedR = data[seedOffset];
	const seedG = data[seedOffset + 1];
	const seedB = data[seedOffset + 2];
	const stepTolerance = ramp === undefined ? 0 : ramp.stepTolerance;
	const seedLimit = ramp === undefined ? 0 : ramp.seedLimit;
	const visited = visitedExternal ?? new Uint8Array(w * h);
	const neighbors =
		connectivity === "8" ? NEIGHBOR_OFFSETS_8 : NEIGHBOR_OFFSETS_4;
	// [Intended] 訪問済みを取り出し時ではなく積む時に立てる。1 画素が 1 度しか積まれない
	// ため待ち行列が画素数で抑えられ、ランプ判定に必要な「どの画素から来たか」を
	// 画素ごとに 1 組だけ持てる。絶対差だけの判定は到達順に依存しないので、
	// 従来の取り出し時マークと同じ結果になる。
	const stack: number[] = [];
	const startIndex = startY * w + startX;
	if (visited[startIndex] === 1) return;
	visited[startIndex] = 1;
	stack.push(startIndex, startIndex);

	while (stack.length > 0) {
		const sourceIndex = stack.pop() as number;
		const index = stack.pop() as number;
		const offset = index * 4;
		if (data[offset + 3] === 0) continue;
		const r = data[offset];
		const g = data[offset + 1];
		const b = data[offset + 2];
		let accepted =
			Math.abs(r - seedR) <= tolerance &&
			Math.abs(g - seedG) <= tolerance &&
			Math.abs(b - seedB) <= tolerance;
		if (!accepted && stepTolerance > 0 && index !== sourceIndex) {
			// [Intended] 参照元はすでに背景として通した画素。アルファだけを 0 にして
			// RGB は残すため、通した後でも段差の基準色として読み出せる。
			const sourceOffset = sourceIndex * 4;
			accepted =
				Math.abs(r - data[sourceOffset]) <= stepTolerance &&
				Math.abs(g - data[sourceOffset + 1]) <= stepTolerance &&
				Math.abs(b - data[sourceOffset + 2]) <= stepTolerance &&
				Math.abs(r - seedR) <= seedLimit &&
				Math.abs(g - seedG) <= seedLimit &&
				Math.abs(b - seedB) <= seedLimit;
		}
		if (!accepted) continue;
		data[offset + 3] = 0;
		const x = index % w;
		const y = (index / w) | 0;
		for (let direction = 0; direction < neighbors.length; direction += 1) {
			const nx = x + neighbors[direction][0];
			const ny = y + neighbors[direction][1];
			if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
			const neighborIndex = ny * w + nx;
			if (visited[neighborIndex] === 1) continue;
			visited[neighborIndex] = 1;
			stack.push(neighborIndex, index);
		}
	}
};
