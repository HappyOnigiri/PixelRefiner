import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import {
	estimateBackgroundModel,
	removeAutomaticBackground,
} from "./background";
import { getBackgroundTargets, removeBackground } from "./background-removal";

const createImage = (
	width: number,
	height: number,
	pixelAt: (x: number, y: number) => readonly [number, number, number, number],
): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const pixel = pixelAt(x, y);
			const offset = (y * width + x) * 4;
			data[offset] = pixel[0];
			data[offset + 1] = pixel[1];
			data[offset + 2] = pixel[2];
			data[offset + 3] = pixel[3];
		}
	}
	return { width, height, data };
};

const alphaAt = (image: RawImage, x: number, y: number): number =>
	image.data[(y * image.width + x) * 4 + 3];

describe("automatic background model", () => {
	it("removes a light gradient whose four corners have different colors", () => {
		const image = createImage(24, 24, (x, y) => {
			if (x >= 7 && x <= 16 && y >= 7 && y <= 16) {
				return [32, 48, 80, 255];
			}
			return [224 + x, 226 + y, 232 + ((x + y) % 5), 255];
		});
		const first = removeAutomaticBackground(image, 64, "outer", "4");
		const second = removeAutomaticBackground(image, 64, "outer", "4");
		const legacy = removeBackground(
			image,
			8,
			"outer",
			"4",
			getBackgroundTargets(image, "top-left"),
			"top-left",
		);

		expect(first.rolledBack).toBe(false);
		expect(first.model.clusters.length).toBeGreaterThan(1);
		expect(first.model.confidence).toBeGreaterThan(0.55);
		expect(alphaAt(first.image, 0, 0)).toBe(0);
		expect(alphaAt(first.image, 23, 23)).toBe(0);
		expect(alphaAt(legacy, 23, 23)).toBe(255);
		expect(alphaAt(first.image, 12, 12)).toBe(255);
		expect(second.image.data).toEqual(first.image.data);
	});

	it("absorbs deterministic compression-like noise around a solid background", () => {
		const image = createImage(20, 20, (x, y) => {
			if (x >= 5 && x <= 14 && y >= 5 && y <= 14) {
				return [180, 48, 64, 255];
			}
			const noise = ((x * 17 + y * 29) % 9) - 4;
			return [210 + noise, 218 - noise, 226 + noise, 255];
		});
		const result = removeAutomaticBackground(image, 40, "outer", "8");

		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 2, 10)).toBe(0);
		expect(alphaAt(result.image, 10, 10)).toBe(255);
	});

	it("does not force removal when the border model has low confidence", () => {
		const image = createImage(20, 20, (x, y) => [
			(x * 73 + y * 41) % 256,
			(x * 19 + y * 101) % 256,
			(x * 151 + y * 7) % 256,
			255,
		]);
		const result = removeAutomaticBackground(image, 64, "outer", "4");

		expect(result.model.confidence).toBeLessThan(0.55);
		expect(result.removedRatio).toBe(0);
		expect(result.image.data).toEqual(image.data);
	});

	it("rolls back instead of erasing an image whose subject reaches the border", () => {
		const image = createImage(16, 16, (x, y) => {
			if (x < 8 && y < 8) return [24, 32, 48, 255];
			return [240, 240, 240, 255];
		});
		const result = removeAutomaticBackground(image, 96, "all", "4");

		expect(result.rolledBack).toBe(true);
		expect(result.removedRatio).toBeGreaterThan(0.92);
		expect(result.image.data).toEqual(image.data);
	});

	it("keeps existing alpha and reduces a white fringe near transparency", () => {
		const image = createImage(12, 12, (x, y) => {
			if (x >= 3 && x <= 8 && y >= 3 && y <= 8) {
				const edge = x === 3 || x === 8 || y === 3 || y === 8;
				return edge ? [190, 190, 190, 255] : [48, 48, 48, 255];
			}
			if (x === 1 && y === 1) return [12, 34, 56, 96];
			return [255, 255, 255, 255];
		});
		const result = removeAutomaticBackground(image, 32, "outer", "4");
		const edgeOffset = (5 * image.width + 3) * 4;

		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 1, 1)).toBe(96);
		expect(result.image.data[edgeOffset]).toBeLessThan(190);
		expect(alphaAt(result.image, 5, 5)).toBe(255);
	});

	it("reduces a black fringe without changing opaque interior pixels", () => {
		const image = createImage(12, 12, (x, y) => {
			if (x >= 3 && x <= 8 && y >= 3 && y <= 8) {
				const edge = x === 3 || x === 8 || y === 3 || y === 8;
				return edge ? [65, 65, 65, 255] : [208, 208, 208, 255];
			}
			return [0, 0, 0, 255];
		});
		const result = removeAutomaticBackground(image, 32, "outer", "4");
		const edgeOffset = (5 * image.width + 3) * 4;
		const interiorOffset = (5 * image.width + 5) * 4;

		expect(result.image.data[edgeOffset]).toBeGreaterThan(65);
		expect(result.image.data[interiorOffset]).toBe(208);
	});

	it("estimates a background when only the outermost ring is transparent", () => {
		const image = createImage(40, 40, (x, y) => {
			if (x === 0 || y === 0 || x === 39 || y === 39) return [0, 0, 0, 0];
			if (x >= 14 && x <= 25 && y >= 14 && y <= 25) return [30, 60, 90, 255];
			return [235, 238, 240, 255];
		});
		const result = removeAutomaticBackground(image, 32, "outer", "4");

		expect(result.model.clusters.length).toBeGreaterThan(0);
		expect(result.rolledBack).toBe(false);
		expect(alphaAt(result.image, 2, 2)).toBe(0);
		expect(alphaAt(result.image, 20, 20)).toBe(255);
	});

	it("corrects the innermost fringe ring within the dehalo radius", () => {
		const image = createImage(16, 16, (x, y) => {
			const inSubject = x >= 4 && x <= 11 && y >= 4 && y <= 11;
			if (!inSubject) return [255, 255, 255, 255];
			if (x === 4 || x === 11 || y === 4 || y === 11) {
				return [200, 200, 200, 255];
			}
			if (x === 5 || x === 10 || y === 5 || y === 10) {
				return [190, 190, 190, 255];
			}
			return [48, 48, 48, 255];
		});
		const result = removeAutomaticBackground(image, 16, "outer", "4");
		const outerRingOffset = (7 * image.width + 4) * 4;
		const innerRingOffset = (7 * image.width + 5) * 4;
		const interiorOffset = (7 * image.width + 7) * 4;

		expect(result.rolledBack).toBe(false);
		expect(result.image.data[outerRingOffset]).toBeLessThan(200);
		expect(result.image.data[innerRingOffset]).toBeLessThan(190);
		expect(result.image.data[interiorOffset]).toBe(48);
	});

	it("treats a fully transparent border as known background", () => {
		const image = createImage(8, 8, (x, y) => {
			if (x === 0 || y === 0 || x === 7 || y === 7) return [200, 10, 50, 0];
			return [30, 60, 90, 255];
		});
		const model = estimateBackgroundModel(image);

		expect(model.confidence).toBe(1);
		expect(model.clusters).toEqual([]);
	});
});
