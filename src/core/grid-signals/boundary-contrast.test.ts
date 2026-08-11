import { describe, expect, it } from "vitest";
import type { RawImage } from "../../shared/types";
import {
	createAxisBoundaryContrastEvaluator,
	createBoundaryContrastEvaluator,
} from "./boundary-contrast";

/** cell px ごとに色が変わる市松状の格子画像。shift だけ格子全体を右下へずらす。 */
const createGridImage = (size: number, cell: number, shift = 0): RawImage => {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const offset = (y * size + x) * 4;
			const dark =
				(Math.floor((x - shift) / cell) + Math.floor((y - shift) / cell)) %
					2 ===
				0
					? 32
					: 224;
			data[offset] = dark;
			data[offset + 1] = dark;
			data[offset + 2] = dark;
			data[offset + 3] = 255;
		}
	}
	return { width: size, height: size, data };
};

const createFlatImage = (size: number): RawImage => {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let index = 0; index < data.length; index += 4) {
		data[index] = 128;
		data[index + 1] = 128;
		data[index + 2] = 128;
		data[index + 3] = 255;
	}
	return { width: size, height: size, data };
};

const opaqueMask = (image: RawImage): RawImage => image;

describe("boundary contrast", () => {
	it("実セル幅で最も高く、過分割では下がる", () => {
		const image = createGridImage(128, 16);
		const evaluate = createBoundaryContrastEvaluator(image, opaqueMask(image));
		const actual = evaluate(16, 16);
		const third = evaluate(16 / 3, 16 / 3);
		const half = evaluate(8, 8);
		expect(actual).toBeGreaterThan(2);
		// [Intended] 過分割では予測境界の大半がセル内部の平坦な位置へ落ちる。
		expect(third).toBeLessThan(actual * 0.6);
		expect(half).toBeLessThan(actual * 0.8);
	});

	it("倍のセル幅は境界がすべて実エッジに乗るため下がらない", () => {
		const image = createGridImage(128, 16);
		const evaluate = createBoundaryContrastEvaluator(image, opaqueMask(image));
		// 再構成誤差と失敗方向が相補的であること。粗すぎる側はこの指標では罰されない。
		expect(evaluate(32, 32)).toBeGreaterThan(evaluate(16 / 3, 16 / 3));
	});

	it("エッジの無い画像では証拠なしを返す", () => {
		const image = createFlatImage(64);
		const evaluate = createBoundaryContrastEvaluator(image, opaqueMask(image));
		expect(evaluate(8, 8)).toBe(0);
	});

	it("画素が足りない画像では 0 を返す", () => {
		const image: RawImage = {
			width: 1,
			height: 1,
			data: new Uint8ClampedArray([0, 0, 0, 255]),
		};
		const evaluate = createBoundaryContrastEvaluator(image, image);
		expect(evaluate(1, 1)).toBe(0);
	});
});

describe("axis boundary contrast", () => {
	/** cell を固定して位相を 1 刻みで走査し、最大になる位相を返す。 */
	const bestPhase = (
		measure: (cell: number, phase?: number) => number,
		cell: number,
	): number => {
		let phaseAtMax = 0;
		let max = measure(cell, 0);
		for (let phase = 1; phase < cell; phase += 1) {
			const value = measure(cell, phase);
			if (value > max) {
				max = value;
				phaseAtMax = phase;
			}
		}
		return phaseAtMax;
	};

	it("格子をずらした画像では、そのずれと同じ位相で最大になる", () => {
		const image = createGridImage(128, 16, 5);
		const axes = createAxisBoundaryContrastEvaluator(image, image);
		expect(bestPhase(axes.x, 16)).toBe(5);
		expect(bestPhase(axes.y, 16)).toBe(5);
	});

	it("ずれていない画像では位相 0 が最大になる", () => {
		const image = createGridImage(128, 16);
		const axes = createAxisBoundaryContrastEvaluator(image, image);
		expect(bestPhase(axes.x, 16)).toBe(0);
		expect(bestPhase(axes.y, 16)).toBe(0);
	});

	it("位相を省略したときは 0 と同じ値になる", () => {
		const image = createGridImage(128, 16);
		const axes = createAxisBoundaryContrastEvaluator(image, image);
		expect(axes.x(16)).toBe(axes.x(16, 0));
	});

	it("画素が足りない画像では両軸とも 0 を返す", () => {
		const image: RawImage = {
			width: 1,
			height: 1,
			data: new Uint8ClampedArray([0, 0, 0, 255]),
		};
		const axes = createAxisBoundaryContrastEvaluator(image, image);
		expect(axes.x(1)).toBe(0);
		expect(axes.y(1)).toBe(0);
	});
});
