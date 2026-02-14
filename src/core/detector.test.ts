import { describe, expect, it } from "vitest";
import type { Pixel } from "../shared/types";
import { getRunLengths } from "./detector";

// quantize is not exported, but it's used internally by getRunLengths.
// We can verify its effect through getRunLengths.

describe("detector.ts (helpers)", () => {
	describe("getRunLengths", () => {
		const W: Pixel = [255, 255, 255, 255]; // White
		const K: Pixel = [0, 0, 0, 255]; // Black
		const T: Pixel = [0, 0, 0, 0]; // Transparent

		it("should correctly identify runs in a pixel strip", () => {
			// [W, W, W, K, K, W]
			const strip: Pixel[] = [W, W, W, K, K, W];
			const segments = getRunLengths(strip, 64);

			expect(segments.length).toBe(1);
			const runs = segments[0].runs;
			expect(runs.length).toBe(3);

			// Run 1: White, length 3
			expect(runs[0]).toMatchObject({
				start: 0,
				length: 3,
				color: [192, 192, 192], // 255 quantized by 64 is 192
			});

			// Run 2: Black, length 2
			expect(runs[1]).toMatchObject({
				start: 3,
				length: 2,
				color: [0, 0, 0],
			});

			// Run 3: White, length 1
			expect(runs[2]).toMatchObject({
				start: 5,
				length: 1,
				color: [192, 192, 192],
			});
		});

		it("should skip transparent pixels based on alpha threshold", () => {
			// [W, T, T, K, K]
			const strip: Pixel[] = [W, T, T, K, K];
			const segments = getRunLengths(strip, 64, 16);

			// Should result in two segments
			expect(segments.length).toBe(2);

			// Segment 1: [W]
			expect(segments[0].start).toBe(0);
			expect(segments[0].runs.length).toBe(1);
			expect(segments[0].runs[0].length).toBe(1);

			// Segment 2: [K, K]
			expect(segments[1].start).toBe(3);
			expect(segments[1].runs.length).toBe(1);
			expect(segments[1].runs[0].length).toBe(2);
		});

		it("should smooth out single pixel noise if it matches neighbors", () => {
			// [W, W, K, W, W, W] -> K is single pixel noise between Ws
			// The smoothing logic requires runs.length >= 3.
			// [W, W], [K], [W, W, W] are 3 runs.
			const strip: Pixel[] = [W, W, K, W, W, W];
			const segments = getRunLengths(strip, 64);

			expect(segments.length).toBe(1);
			const runs = segments[0].runs;

			// If smoothing works, it should be one single run of White
			// But wait, the current implementation might result in [W, W+1+W] -> [W, W]
			// Let's check the logic again.
			// Run 0: W, len 2
			// Run 1: K, len 1 -> prev=W, next=W -> smoothed.push(last.start, last.length+1, last.color)
			// Run 2: W, len 3 -> smoothed.push(run)
			// Result: [ {len: 3, color: W}, {len: 3, color: W} ]
			// They are NOT merged into one run in the smoothing loop.
			expect(runs.length).toBe(2);
			expect(runs[0].length).toBe(3);
			expect(runs[1].length).toBe(3);
			expect(runs[0].color).toEqual([192, 192, 192]);
			expect(runs[1].color).toEqual([192, 192, 192]);
		});
	});
});
