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
	it("creates three aspect-aware and visually distinct detail candidates", () => {
		const candidates = createConvertCandidates(createIllustration());

		expect(candidates.map((candidate) => candidate.label)).toEqual([
			"coarse",
			"balanced",
			"detailed",
		]);
		expect(candidates[0].outW).toBeLessThan(candidates[1].outW);
		expect(candidates[1].outW).toBeLessThan(candidates[2].outW);
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

	it("handles fully transparent and tiny images without failure", () => {
		const transparent: RawImage = {
			width: 1,
			height: 1,
			data: new Uint8ClampedArray([123, 45, 67, 0]),
		};

		expect(createConvertCandidates(transparent)).toHaveLength(3);
		expect(edgeAwareAreaResample(transparent, 1, 1).data).toEqual(
			new Uint8ClampedArray(4),
		);
	});
});
