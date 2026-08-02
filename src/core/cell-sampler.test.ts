import { describe, expect, it } from "vitest";
import type { PixelGrid, RawImage } from "../shared/types";
import { createCellSampler, sampleImageCells } from "./cell-sampler";
import { downsample } from "./image-operations";
import { normalizeProcessOptions } from "./processor-options";

const grid = (width: number, height: number): PixelGrid => ({
	cellW: width,
	cellH: height,
	offsetX: 0,
	offsetY: 0,
	outW: 1,
	outH: 1,
	score: 0,
});

const image = (width: number, height: number, pixels: number[]): RawImage => ({
	width,
	height,
	data: new Uint8ClampedArray(pixels),
});

const options = {
	mode: "alpha-aware-medoid",
	maxSamplesPerCell: 64,
	alphaThreshold: 16,
	preserveThinFeatures: false,
} as const;

describe("cell sampler", () => {
	it("chooses an input RGB instead of creating channel-wise median colors", () => {
		const source = image(
			2,
			2,
			[255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255],
		);
		const legacy = downsample(source, grid(2, 2), 3);
		const restored = sampleImageCells(source, grid(2, 2), options);

		expect(Array.from(legacy.data)).toEqual([128, 128, 128, 255]);
		const inputColors = new Set([
			"255,0,0",
			"0,255,0",
			"0,0,255",
			"255,255,255",
		]);
		expect(
			inputColors.has(Array.from(restored.data.slice(0, 3)).join(",")),
		).toBe(true);
	});

	it("ignores hidden transparent RGB while retaining area coverage in alpha", () => {
		const source = image(
			4,
			1,
			[240, 32, 24, 255, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0],
		);
		const restored = sampleImageCells(source, grid(4, 1), options);

		expect(Array.from(restored.data)).toEqual([240, 32, 24, 64]);
	});

	it("supports premultiplied area-weighted sampling as a bounded alternative", () => {
		const source = image(2, 1, [255, 0, 0, 255, 0, 0, 255, 255]);
		const restored = sampleImageCells(source, grid(2, 1), {
			...options,
			mode: "area-weighted",
		});

		expect(Array.from(restored.data)).toEqual([128, 0, 128, 255]);
	});

	it("returns a transparent cell for an empty source", () => {
		const restored = sampleImageCells(
			{ width: 0, height: 0, data: new Uint8ClampedArray() },
			grid(1, 1),
			options,
		);

		expect(Array.from(restored.data)).toEqual([0, 0, 0, 0]);
	});

	it("protects a cell-spanning thin feature when requested", () => {
		const data = new Uint8ClampedArray(10 * 5 * 4);
		for (let y = 0; y < 5; y += 1) {
			for (let x = 0; x < 10; x += 1) {
				const offset = (y * 10 + x) * 4;
				data[offset] = y === 2 ? 240 : 16;
				data[offset + 1] = y === 2 ? 48 : 16;
				data[offset + 2] = y === 2 ? 32 : 16;
				data[offset + 3] = 255;
			}
		}
		const source: RawImage = { width: 10, height: 5, data };
		const featureGrid = { ...grid(5, 5), outW: 2 };
		const withoutProtection = sampleImageCells(source, featureGrid, options);
		const withProtection = sampleImageCells(source, featureGrid, {
			...options,
			preserveThinFeatures: true,
		});

		expect(Array.from(withoutProtection.data)).toEqual([
			16, 16, 16, 255, 16, 16, 16, 255,
		]);
		expect(Array.from(withProtection.data)).toEqual([
			240, 48, 32, 255, 240, 48, 32, 255,
		]);
	});

	it("uses a deterministic bounded sample set for large cells", () => {
		const width = 64;
		const height = 64;
		const data = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const offset = (y * width + x) * 4;
				data[offset] = x === 32 ? 0 : 240;
				data[offset + 2] = x === 32 ? 240 : 0;
				data[offset + 3] = 255;
			}
		}
		const source: RawImage = { width, height, data };
		const boundedSampler = createCellSampler({
			...options,
			maxSamplesPerCell: 64,
		});
		const secondSampler = createCellSampler({
			...options,
			maxSamplesPerCell: 64,
		});
		const centerOnlySampler = createCellSampler({
			...options,
			maxSamplesPerCell: 1,
		});
		const bounds = { x0: 0, y0: 0, x1: width, y1: height };
		const context = { cellX: 0, cellY: 0, grid: grid(width, height) };

		expect(boundedSampler.sample(source, bounds, context)).toEqual([
			240, 0, 0, 255,
		]);
		expect(secondSampler.sample(source, bounds, context)).toEqual([
			240, 0, 0, 255,
		]);
		expect(centerOnlySampler.sample(source, bounds, context)).toEqual([
			0, 0, 240, 255,
		]);
	});

	it("protects a thin feature whose RGB is constant across an alpha gradient", () => {
		const data = new Uint8ClampedArray(10 * 5 * 4);
		for (let y = 0; y < 5; y += 1) {
			for (let x = 0; x < 10; x += 1) {
				const offset = (y * 10 + x) * 4;
				data[offset] = y === 2 ? 240 : 16;
				data[offset + 1] = y === 2 ? 48 : 16;
				data[offset + 2] = y === 2 ? 32 : 16;
				data[offset + 3] = y === 2 ? 64 + (x % 4) * 48 : 255;
			}
		}
		const restored = sampleImageCells(
			{ width: 10, height: 5, data },
			{ ...grid(5, 5), outW: 2 },
			{ ...options, preserveThinFeatures: true },
		);

		expect(Array.from(restored.data.slice(0, 3))).toEqual([240, 48, 32]);
		expect(Array.from(restored.data.slice(4, 7))).toEqual([240, 48, 32]);
	});

	it("keeps the legacy median mode available for comparisons", () => {
		const source = image(
			2,
			2,
			[255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255],
		);
		const restored = downsample(source, grid(2, 2), {
			mode: "legacy-median",
			sampleWindow: 3,
			maxSamplesPerCell: 64,
			alphaThreshold: 16,
			preserveThinFeatures: true,
		});

		expect(Array.from(restored.data)).toEqual([128, 128, 128, 255]);
	});

	it("normalizes public sampling limits through shared configuration", () => {
		const normalized = normalizeProcessOptions({
			maxSamplesPerCell: 999,
			cellAlphaThreshold: -10,
			cellSamplingMode: "edge-aware",
		});

		expect(normalized.maxSamplesPerCell).toBe(256);
		expect(normalized.cellAlphaThreshold).toBe(0);
		expect(normalized.cellSamplingMode).toBe("edge-aware");
	});
});
