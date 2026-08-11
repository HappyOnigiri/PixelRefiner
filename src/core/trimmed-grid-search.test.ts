import { describe, expect, it } from "vitest";
import { BOUNDARY_CONTRAST_LIMITS } from "../shared/config";
import type { RawImage } from "../shared/types";
import { getGridSearchFromTrimmedStrategy } from "./trimmed-grid-search";

/** cell px の市松格子を shift px だけ右下へずらした画像。 */
const createShiftedGridImage = (
	size: number,
	cell: number,
	shift: number,
): RawImage => {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const value =
				(Math.floor((x - shift) / cell) + Math.floor((y - shift) / cell)) %
					2 ===
				0
					? 40
					: 216;
			const offset = (y * size + x) * 4;
			data[offset] = value;
			data[offset + 1] = value;
			data[offset + 2] = value;
			data[offset + 3] = 255;
		}
	}
	return { width: size, height: size, data };
};

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

	it("正解の 5 倍細かい過分割からでも粗い倍音へ乗り換える", () => {
		// [Intended] 正解セル 40px（出力 11x11）に 8px の濃淡を敷いた 440x440。
		// 再構成はセル 32px までしか粗く探索しないので正解へ自力では届かず、
		// ちょうど 5 倍細かい 55x55 を選ぶ。倍音表から整数倍が 1 つでも抜けると、
		// 窓幅は中心の 10% しかないため正解が前後の窓の隙間へ落ちて評価されない。
		const fiveTimes = createNestedBlockImage(440, 40, 8, 30);
		const estimate = strategy.search(fiveTimes, fiveTimes, 3);
		expect(estimate).not.toBeNull();
		expect(estimate?.outW).toBe(11);
		expect(estimate?.outH).toBe(11);
	});

	it("格子が BBox の縁で合っている入力では、位相 0 を実測済みとして返す", () => {
		// [Intended] 位相 0 は「ずれていない」という実測結果なので、投影は BBox 起点へ
		// 寄せたままにする。位相未測定と同じ扱いにするとキャンバス起点へ戻ってしまう。
		const estimate = strategy.search(image, image, 3);
		expect(estimate?.phaseMeasured).toBe(true);
		expect(estimate?.offsetX).toBe(0);
		expect(estimate?.offsetY).toBe(0);
	});

	it("境界の証拠が薄い軸があれば位相を測らない", () => {
		// [Intended] エッジ信号を落とすと境界コントラストが 0 になり、minPhaseEvidence を
		// 下回る。位相は決めず、投影は従来どおりキャンバス起点に任せる。
		const shifted = createShiftedGridImage(80, 10, 3);
		const estimate = strategy.search(
			shifted,
			shifted,
			3,
			undefined,
			NO_EDGE_SIGNALS,
		);

		expect(estimate).not.toBeNull();
		expect(estimate?.phaseMeasured).toBe(false);
		expect(estimate?.offsetX).toBe(0);
		expect(estimate?.offsetY).toBe(0);
	});

	it("片方の軸しか格子に乗っていない入力では位相を測らない", () => {
		// 縦縞だけの画像。x 軸には境界があるが、y 軸は一様でコントラストが立たない。
		const size = 80;
		const data = new Uint8ClampedArray(size * size * 4);
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				const value = Math.floor((x - 3) / 10) % 2 === 0 ? 40 : 216;
				const offset = (y * size + x) * 4;
				data[offset] = value;
				data[offset + 1] = value;
				data[offset + 2] = value;
				data[offset + 3] = 255;
			}
		}
		const stripes: RawImage = { width: size, height: size, data };
		const estimate = strategy.search(stripes, stripes, 3);

		expect(estimate).not.toBeNull();
		expect(estimate?.phaseMeasured).toBe(false);
		expect(estimate?.offsetX).toBe(0);
		expect(estimate?.offsetY).toBe(0);
	});

	it("セルが minPhaseCellPixels 未満なら位相を測らない", () => {
		// セル 4px の格子。セル内部の 1px の線と境界を区別できない領域なので測らない。
		const fine = createShiftedGridImage(64, 4, 1);
		const estimate = strategy.search(fine, fine, 3);

		expect(estimate).not.toBeNull();
		expect(estimate?.cellW).toBeLessThan(
			BOUNDARY_CONTRAST_LIMITS.minPhaseCellPixels,
		);
		expect(estimate?.phaseMeasured).toBe(false);
		expect(estimate?.offsetX).toBe(0);
	});

	it("セル内の反復線が境界より強い入力では、位相をずらさない", () => {
		// [Intended] セル 10px の各セル内 localX/localY=3 に明るい線を敷いた 80x80。
		// 境界コントラストの最大は内部の線に立つため、そのまま採ると位相が 3 ずれる。
		// 再構成誤差での裏取りが効けば、位相をずらさない格子が返る。
		const size = 80;
		const cell = 10;
		const data = new Uint8ClampedArray(size * size * 4);
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				const base =
					(Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 40 : 200;
				const value = x % cell === 3 || y % cell === 3 ? 255 : base;
				const offset = (y * size + x) * 4;
				data[offset] = value;
				data[offset + 1] = value;
				data[offset + 2] = value;
				data[offset + 3] = 255;
			}
		}
		const innerLine: RawImage = { width: size, height: size, data };
		const estimate = strategy.search(innerLine, innerLine, 3);

		expect(estimate).not.toBeNull();
		expect(estimate?.outW).toBe(8);
		expect(estimate?.outH).toBe(8);
		expect(estimate?.offsetX).toBe(0);
		expect(estimate?.offsetY).toBe(0);
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

	it("候補にも採用格子と同じ手順で位相が載る", () => {
		// [Intended] 採用格子だけに位相を載せると、同じセル寸法の候補が位相 0 の別サイズ
		// として残り、投影後のサイズが採用格子と食い違う（実測: auto_grid_detection で
		// 採用 203x116 の隣に 202x114 が並んでいた）。
		const estimate = strategy.search(image, image, 3);
		const candidates = estimate?.candidates ?? [];
		expect(candidates.length).toBeGreaterThan(1);
		for (const candidate of candidates) {
			expect(candidate.phaseMeasured).toBeTypeOf("boolean");
		}
	});
});
