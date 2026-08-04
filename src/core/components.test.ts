import { describe, expect, it } from "vitest";
import type { RawImage, SmallComponentRemovalMode } from "../shared/types";
import { removeSmallComponents } from "./components";

type Pixel = readonly [number, number, number, number];

const imageFrom = (
	width: number,
	height: number,
	pixelAt: (x: number, y: number) => Pixel,
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

const run = (
	mask: RawImage,
	evidence: RawImage,
	mode: SmallComponentRemovalMode = "auto",
	backgroundConfidence = 1,
) =>
	removeSmallComponents(mask, mask, evidence, {
		mode,
		alphaThreshold: 16,
		backgroundEnabled: true,
		automaticBackground: true,
		backgroundConfidence,
	});

const alphaAt = (image: RawImage, x: number, y: number): number =>
	image.data[(y * image.width + x) * 4 + 3];

const basicImages = (
	extraMask: (x: number, y: number) => Pixel,
	extraEvidence = extraMask,
): { mask: RawImage; evidence: RawImage } => {
	const width = 12;
	const height = 10;
	const main = (x: number, y: number): boolean =>
		x >= 1 && x <= 4 && y >= 2 && y <= 7;
	return {
		mask: imageFrom(width, height, (x, y) =>
			main(x, y) ? [40, 60, 80, 255] : extraMask(x, y),
		),
		evidence: imageFrom(width, height, (x, y) =>
			main(x, y) ? [40, 60, 80, 255] : extraEvidence(x, y),
		),
	};
};

describe("safe small-component removal", () => {
	it("removes an isolated weak component and reports logical counts", () => {
		const transparent = [0, 0, 0, 0] as const;
		const { mask, evidence } = basicImages(
			(x, y) => (x === 10 && y === 8 ? [120, 120, 120, 255] : transparent),
			(x, y) => (x === 10 && y === 8 ? [20, 20, 20, 32] : transparent),
		);
		const result = run(mask, evidence);

		expect(alphaAt(result.image, 10, 8)).toBe(0);
		expect(result.diagnostic).toMatchObject({
			applied: true,
			removedComponents: 1,
			removedPixels: 1,
			pixelBasis: "logical",
		});
		expect(mask.data[(8 * mask.width + 10) * 4 + 3]).toBe(255);
	});

	it("keeps repeated same-color shapes such as paired eyes and marks", () => {
		const transparent = [0, 0, 0, 0] as const;
		const { mask, evidence } = basicImages((x, y) =>
			(x === 8 || x === 10) && y === 2 ? [220, 80, 40, 80] : transparent,
		);
		const result = run(mask, evidence);

		expect(alphaAt(result.image, 8, 2)).toBe(80);
		expect(alphaAt(result.image, 10, 2)).toBe(80);
		expect(result.diagnostic.removedComponents).toBe(0);
	});

	it("counts the largest component when only two repeated marks exist", () => {
		const transparent = [0, 0, 0, 0] as const;
		const mask = imageFrom(6, 3, (x, y) =>
			(x === 0 || x === 5) && y === 1 ? [120, 80, 40, 80] : transparent,
		);
		const result = run(mask, mask);

		expect(alphaAt(result.image, 0, 1)).toBe(80);
		expect(alphaAt(result.image, 5, 1)).toBe(80);
		expect(result.diagnostic.removedComponents).toBe(0);
	});

	it("ignores hidden RGB values in fully transparent neighbors", () => {
		const transparentBlack = [0, 0, 0, 0] as const;
		const transparentWhite = [255, 255, 255, 0] as const;
		const mask = basicImages((x, y) =>
			x === 10 && y === 8 ? [20, 20, 20, 32] : transparentBlack,
		).mask;
		const blackEvidence = basicImages((x, y) =>
			x === 10 && y === 8 ? [20, 20, 20, 32] : transparentBlack,
		).evidence;
		const whiteEvidence = basicImages((x, y) =>
			x === 10 && y === 8 ? [20, 20, 20, 32] : transparentWhite,
		).evidence;

		const blackResult = run(mask, blackEvidence);
		const whiteResult = run(mask, whiteEvidence);
		expect(blackResult.image.data).toEqual(whiteResult.image.data);
		expect(blackResult.diagnostic).toEqual(whiteResult.diagnostic);
	});

	it("keeps differently colored components in symmetric positions", () => {
		const transparent = [0, 0, 0, 0] as const;
		const { mask, evidence } = basicImages((x, y) => {
			if (x === 0 && y === 0) return [20, 100, 160, 80];
			if (x === 5 && y === 0) return [160, 100, 20, 80];
			return transparent;
		});
		const result = run(mask, evidence);

		expect(alphaAt(result.image, 0, 0)).toBe(80);
		expect(alphaAt(result.image, 5, 0)).toBe(80);
	});

	it("keeps one-pixel gaps and diagonal 8-neighbor groups", () => {
		const transparent = [0, 0, 0, 0] as const;
		const { mask, evidence } = basicImages((x, y) => {
			if (x === 6 && y === 4) return [90, 90, 90, 80];
			if ((x === 9 && y === 6) || (x === 10 && y === 7)) {
				return [130, 130, 130, 80];
			}
			return transparent;
		});
		const result = run(mask, evidence, "light");

		expect(alphaAt(result.image, 6, 4)).toBe(80);
		expect(alphaAt(result.image, 9, 6)).toBe(80);
		expect(alphaAt(result.image, 10, 7)).toBe(80);
	});

	it("keeps outline extensions, strong edges, and highly opaque details", () => {
		const transparent = [0, 0, 0, 0] as const;
		const mask = imageFrom(12, 12, (x, y) => {
			if (y === 5 && x >= 2 && x <= 7) return [20, 20, 20, 255];
			if (x === 9 && y === 5) return [20, 20, 20, 80];
			if (x === 11 && y === 0) return [255, 255, 255, 80];
			if (x === 0 && y === 11) return [90, 90, 90, 240];
			return transparent;
		});
		const result = run(mask, mask, "strong");

		expect(alphaAt(result.image, 9, 5)).toBe(80);
		expect(alphaAt(result.image, 11, 0)).toBe(80);
		expect(alphaAt(result.image, 0, 11)).toBe(240);
	});

	it("uses mode thresholds without weakening protection rules", () => {
		const transparent = [0, 0, 0, 0] as const;
		const { mask, evidence } = basicImages(
			(x, y) =>
				y === 9 && x >= 8 && x <= 10 ? [100, 100, 100, 255] : transparent,
			(x, y) => (y === 9 && x >= 8 && x <= 10 ? [20, 20, 20, 32] : transparent),
		);

		expect(run(mask, evidence, "light").diagnostic.removedPixels).toBe(0);
		expect(run(mask, evidence, "strong").diagnostic.removedPixels).toBe(3);
	});

	it("skips automatic removal when background confidence is low", () => {
		const transparent = [0, 0, 0, 0] as const;
		const { mask, evidence } = basicImages(
			(x, y) => (x === 10 && y === 8 ? [120, 120, 120, 255] : transparent),
			(x, y) => (x === 10 && y === 8 ? [20, 20, 20, 32] : transparent),
		);
		const result = run(mask, evidence, "auto", 0.2);

		expect(result.image).toBe(mask);
		expect(result.diagnostic).toMatchObject({
			applied: false,
			skippedReason: "low-background-confidence",
			removedPixels: 0,
		});
	});

	it("handles empty images deterministically", () => {
		const empty = imageFrom(3, 3, () => [0, 0, 0, 0]);
		const first = run(empty, empty);
		const second = run(empty, empty);

		expect(first.image.data).toEqual(second.image.data);
		expect(first.diagnostic.removedPixels).toBe(0);
	});
});
