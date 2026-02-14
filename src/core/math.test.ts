import { describe, expect, it } from "vitest";
import { computeMedian, computePercentile, computeVariance } from "./math";

describe("math.ts", () => {
	describe("computeMedian", () => {
		it("配列要素数が奇数の場合、中央の値が返ること", () => {
			expect(computeMedian([1, 3, 2])).toBe(2);
			expect(computeMedian([10, 20, 30, 40, 50])).toBe(30);
		});

		it("配列要素数が偶数の場合、中央2つの平均値が返ること", () => {
			expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
			expect(computeMedian([10, 20])).toBe(15);
		});

		it("並び替えられていない配列でも正しく動作すること", () => {
			expect(computeMedian([5, 1, 9, 3])).toBe(4); // [1, 3, 5, 9] -> (3+5)/2 = 4
		});

		it("空配列の場合、0を返すこと", () => {
			expect(computeMedian([])).toBe(0);
		});

		it("要素数が1つの場合、その値自体が返ること", () => {
			expect(computeMedian([42])).toBe(42);
		});

		it("負の値が含まれていても計算が正しいこと", () => {
			expect(computeMedian([-10, 0, 10])).toBe(0);
			expect(computeMedian([-5, -1])).toBe(-3);
		});
	});

	describe("computeVariance", () => {
		it("分散が正しく計算されること", () => {
			// [1, 2, 3] -> mean = 2, variance = ((1-2)^2 + (2-2)^2 + (3-2)^2) / 3 = (1 + 0 + 1) / 3 = 2/3
			expect(computeVariance([1, 2, 3])).toBeCloseTo(2 / 3);
		});

		it("空配列の場合、0を返すこと", () => {
			expect(computeVariance([])).toBe(0);
		});

		it("要素数が1つの場合、0を返すこと", () => {
			expect(computeVariance([10])).toBe(0);
		});
	});

	describe("computePercentile", () => {
		it("パーセンタイルが正しく計算されること", () => {
			const values = [1, 2, 3, 4, 5];
			expect(computePercentile(values, 0)).toBe(1);
			expect(computePercentile(values, 100)).toBe(5);
			expect(computePercentile(values, 50)).toBe(3);
			expect(computePercentile(values, 25)).toBe(2);
			expect(computePercentile(values, 75)).toBe(4);
		});

		it("空配列の場合、0を返すこと", () => {
			expect(computePercentile([], 50)).toBe(0);
		});

		it("範囲外のpが指定された場合、0-100にクランプされること", () => {
			const values = [1, 2, 3];
			expect(computePercentile(values, -10)).toBe(1);
			expect(computePercentile(values, 110)).toBe(3);
		});
	});
});
