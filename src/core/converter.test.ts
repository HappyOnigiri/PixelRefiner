import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { createConvertCandidates, edgeAwareAreaResample } from "./converter";

const createIllustration = (width = 96, height = 64): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			const inSubject = (x - 48) ** 2 / 900 + (y - 32) ** 2 / 400 < 1;
			data[index] = inSubject ? 32 + ((x * 3) % 80) : 220 - y;
			data[index + 1] = inSubject ? 96 + y : 180 + (x % 48);
			data[index + 2] = inSubject ? 180 + (x % 64) : 128 + y;
			data[index + 3] = x < 4 ? x * 64 : 255;
		}
	}
	return { width, height, data };
};

describe("continuous image converter", () => {
	it("creates five aspect-aware size candidates in ascending order", () => {
		const candidates = createConvertCandidates(createIllustration());

		expect(candidates.map((candidate) => candidate.label)).toEqual([
			"smallest",
			"small",
			"coarse",
			"balanced",
			"detailed",
		]);
		for (let i = 1; i < candidates.length; i += 1) {
			expect(candidates[i - 1].outW).toBeLessThan(candidates[i].outW);
			expect(candidates[i - 1].outH).toBeLessThan(candidates[i].outH);
		}
		for (const candidate of candidates) {
			expect(candidate.outW).toBeGreaterThan(1);
			expect(candidate.outH).toBeGreaterThan(1);
			expect(candidate.outW / candidate.outH).toBeCloseTo(1.5, 1);
		}
	});

	it("is deterministic and ignores RGB in fully transparent pixels", () => {
		const clean = createIllustration(32, 24);
		const noisy = createIllustration(32, 24);
		for (let y = 0; y < clean.height; y += 1) {
			for (let x = 0; x < 4; x += 1) {
				const index = (y * clean.width + x) * 4;
				clean.data[index] = 0;
				clean.data[index + 1] = 0;
				clean.data[index + 2] = 0;
				clean.data[index + 3] = 0;
				noisy.data[index] = (x * 67 + y * 31) % 256;
				noisy.data[index + 1] = (x * 17 + y * 73) % 256;
				noisy.data[index + 2] = (x * 43 + y * 29) % 256;
				noisy.data[index + 3] = 0;
			}
		}

		const first = edgeAwareAreaResample(clean, 12, 9);
		expect(edgeAwareAreaResample(clean, 12, 9)).toEqual(first);
		expect(edgeAwareAreaResample(noisy, 12, 9)).toEqual(first);
	});

	it("retains a high-contrast one-pixel line during area reduction", () => {
		const width = 24;
		const height = 24;
		const data = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const index = (y * width + x) * 4;
				const value = x === 11 ? 0 : 255;
				data[index] = value;
				data[index + 1] = value;
				data[index + 2] = value;
				data[index + 3] = 255;
			}
		}

		const converted = edgeAwareAreaResample({ width, height, data }, 6, 6);
		let darkPixels = 0;
		for (let i = 0; i < converted.data.length; i += 4) {
			if (converted.data[i] < 64) darkPixels += 1;
		}
		expect(darkPixels).toBeGreaterThan(0);
	});

	it("does not surface the RGB of a nearly transparent pixel as an opaque color", () => {
		const width = 24;
		const height = 24;
		const build = (spotRed: number): RawImage => {
			const data = new Uint8ClampedArray(width * height * 4);
			for (let i = 0; i < data.length; i += 4) {
				data[i] = 255;
				data[i + 1] = 255;
				data[i + 2] = 255;
				data[i + 3] = 255;
			}
			const spot = (12 * width + 12) * 4;
			data[spot] = spotRed;
			data[spot + 1] = spotRed;
			data[spot + 2] = spotRed;
			data[spot + 3] = 1;
			return { width, height, data };
		};

		// ほぼ透明な1画素の RGB を変えても、出力の可視色は変わらない。
		const white = edgeAwareAreaResample(build(255), 9, 9);
		const black = edgeAwareAreaResample(build(0), 9, 9);
		expect(black).toEqual(white);
		for (let i = 0; i < black.data.length; i += 4) {
			if (black.data[i + 3] > 32) expect(black.data[i]).toBeGreaterThan(200);
		}
	});

	it("keeps candidate sizes stable across the analysis sampling threshold", () => {
		// 透明と不透明が1画素ごとに交互に並ぶ画像。原点固定の間引きだと片方の位相しか読めない。
		const build = (width: number, height: number): RawImage => {
			const data = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y += 1) {
				for (let x = 0; x < width; x += 1) {
					const index = (y * width + x) * 4;
					const opaque = (x + y) % 2 === 0;
					data[index] = 255;
					data[index + 1] = 255;
					data[index + 2] = 255;
					data[index + 3] = opaque ? 255 : 0;
				}
			}
			return { width, height, data };
		};

		const below = createConvertCandidates(build(256, 256));
		const above = createConvertCandidates(build(257, 256));
		for (let i = 0; i < below.length; i += 1) {
			expect(above[i].outH).toBeGreaterThanOrEqual(below[i].outH - 1);
		}
	});

	it("handles fully transparent and tiny images without failure", () => {
		const transparent: RawImage = {
			width: 1,
			height: 1,
			data: new Uint8ClampedArray([123, 45, 67, 0]),
		};

		expect(createConvertCandidates(transparent)).toHaveLength(5);
		expect(edgeAwareAreaResample(transparent, 1, 1).data).toEqual(
			new Uint8ClampedArray(4),
		);
	});
});
