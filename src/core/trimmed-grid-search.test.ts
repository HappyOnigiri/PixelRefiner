import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { getGridSearchFromTrimmedStrategy } from "./trimmed-grid-search";

/**
 * セル境界だけが強いエッジで、セル内部には弱い濃淡がある市松画像。
 *
 * [Intended] 再構成誤差は内部の濃淡を再現できる細かい格子を選ぶため、
 * 単独では正解セルの整数分の 1 を選んでしまう。境界コントラストが乗り換えを
 * 決められるかを見るには、この「内部に構造がある」形が必要になる。
 */
const createNestedBlockImage = (
	size: number,
	cell: number,
	sub: number,
	subAmplitude: number,
): RawImage => {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const base =
				(Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 40 : 216;
			const subX = Math.floor((x % cell) / sub);
			const subY = Math.floor((y % cell) / sub);
			const wobble = (((subX * 3 + subY * 5) % 3) - 1) * subAmplitude;
			const value = base + (base < 128 ? wobble : -wobble);
			const offset = (y * size + x) * 4;
			data[offset] = value;
			data[offset + 1] = value;
			data[offset + 2] = value;
			data[offset + 3] = 255;
		}
	}
	return { width: size, height: size, data };
};

/** エッジ信号をすべて無効にした設定。境界コントラストが 0 になる。 */
const NO_EDGE_SIGNALS = {
	colorBoundary: false,
	luminanceAlphaGradient: false,
} as const;

describe("fast grid search from trimmed", () => {
	const strategy = getGridSearchFromTrimmedStrategy(true);
	// 正解セル 24px（出力 8x8）に、8px の弱い濃淡を敷いた 192x192。
	const image = createNestedBlockImage(192, 24, 8, 30);

	it("再構成が選ぶ過分割から、境界が揃う粗い倍音へ乗り換える", () => {
		const estimate = strategy.search(image, image, 3);
		expect(estimate).not.toBeNull();
		expect(estimate?.outW).toBe(8);
		expect(estimate?.outH).toBe(8);
	});

	it("境界コントラストが 0 の設定では乗り換えず、再構成の過分割を返す", () => {
		// [Intended] 乗り換えの効果を、同じ画像で信号だけを落として対比する。
		// 3 倍細かい格子が返ることが、上のテストが乗り換え経路を通っている証拠になる。
		const estimate = strategy.search(
			image,
			image,
			3,
			undefined,
			NO_EDGE_SIGNALS,
		);
		expect(estimate).not.toBeNull();
		expect(estimate?.outH).toBe(24);
	});

	it("乗り換えた格子には、乗り換え判定に使った境界コントラストが載る", () => {
		const estimate = strategy.search(image, image, 3);
		expect(estimate?.gridEvidenceMax).toBeGreaterThan(1);
		expect(estimate?.gridEvidenceContested).toBe(false);
	});

	it("ヒント指定時は境界コントラストを載せない", () => {
		// [Intended] ヒント近傍の窓内最大は全域の最大とは意味が違うため、
		// 曖昧さの判定材料として持ち回さない。
		const estimate = strategy.search(image, image, 3, { outW: 24, outH: 24 });
		expect(estimate).not.toBeNull();
		expect(estimate?.gridEvidence).toBeUndefined();
		expect(estimate?.gridEvidenceMax).toBeUndefined();
	});

	it("候補一覧には採用格子の倍音が含まれる", () => {
		const estimate = strategy.search(image, image, 3);
		const outHeights = (estimate?.candidates ?? []).map(
			(candidate) => candidate.outH,
		);
		expect(outHeights.length).toBeGreaterThan(1);
		// 採用格子 8 に対する 2 倍・3 倍。倍率の取り違えは倍音関係で起きるため、
		// 候補選択で救えるようこの兄弟を必ず含める。
		expect(outHeights).toContain(16);
		expect(outHeights).toContain(24);
	});
});
