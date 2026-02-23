import { describe, expect, it } from "vitest";
import { computeMedian, computePercentile, computeVariance } from "./math";

describe("math.ts", () => {
	describe("computeMedian", () => {
		it("should return the middle value when the number of elements is odd", () => {
			expect(computeMedian([1, 3, 2])).toBe(2);
			expect(computeMedian([10, 20, 30, 40, 50])).toBe(30);
		});

		it("should return the average of the two middle values when the number of elements is even", () => {
			expect(computeMedian([1, 2, 3, 4])).toBe(2.5);
			expect(computeMedian([10, 20])).toBe(15);
		});

		it("should work correctly even with unsorted arrays", () => {
			expect(computeMedian([5, 1, 9, 3])).toBe(4); // [1, 3, 5, 9] -> (3+5)/2 = 4
		});

		it("should return 0 for an empty array", () => {
			expect(computeMedian([])).toBe(0);
		});

		it("should return the value itself when there is only one element", () => {
			expect(computeMedian([42])).toBe(42);
		});

		it("should calculate correctly even if negative values are included", () => {
			expect(computeMedian([-10, 0, 10])).toBe(0);
			expect(computeMedian([-5, -1])).toBe(-3);
		});
	});

	describe("computeVariance", () => {
		it("should calculate variance correctly", () => {
			// [1, 2, 3] -> mean = 2, variance = ((1-2)^2 + (2-2)^2 + (3-2)^2) / 3 = (1 + 0 + 1) / 3 = 2/3
			expect(computeVariance([1, 2, 3])).toBeCloseTo(2 / 3);
		});

		it("should return 0 for an empty array", () => {
			expect(computeVariance([])).toBe(0);
		});

		it("should return 0 when there is only one element", () => {
			expect(computeVariance([10])).toBe(0);
		});
	});

	describe("computePercentile", () => {
		it("should calculate percentile correctly", () => {
			const values = [1, 2, 3, 4, 5];
			expect(computePercentile(values, 0)).toBe(1);
			expect(computePercentile(values, 100)).toBe(5);
			expect(computePercentile(values, 50)).toBe(3);
			expect(computePercentile(values, 25)).toBe(2);
			expect(computePercentile(values, 75)).toBe(4);
		});

		it("should return 0 for an empty array", () => {
			expect(computePercentile([], 50)).toBe(0);
		});

		it("should clamp p to 0-100 if it is out of range", () => {
			const values = [1, 2, 3];
			expect(computePercentile(values, -10)).toBe(1);
			expect(computePercentile(values, 110)).toBe(3);
		});
	});
});
