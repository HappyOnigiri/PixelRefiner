import { describe, expect, it } from "vitest";
import type { ProcessResult, RawImage } from "../shared/types";
import {
	type BatchImageProcessor,
	needsBatchAttention,
	processBatchImages,
} from "./batch";

const image = (value: number): RawImage => ({
	width: 2,
	height: 2,
	data: new Uint8ClampedArray([
		value,
		0,
		0,
		255,
		value,
		0,
		0,
		255,
		value,
		0,
		0,
		255,
		value,
		0,
		0,
		255,
	]),
});

const solidPixel = (r: number, g: number, b: number): RawImage => ({
	width: 1,
	height: 1,
	data: new Uint8ClampedArray([r, g, b, 255]),
});

const resultFor = (source: RawImage): ProcessResult => ({
	result: source,
	grid: { cellW: 1, cellH: 1, offsetX: 0, offsetY: 0, score: 1 },
	extractedPalette: [{ r: source.data[0], g: 0, b: 0 }],
	compareBefore: source,
	compareBeforeSanitized: source,
	analysis: {
		classification: "native-pixel",
		classificationConfidence: 0.9,
		route: "preserve",
		confidence: 1,
		warnings: [],
		gridCandidates: [],
	},
});

const batchOptions = {
	sharedPalette: false,
	colorCount: 2,
	ditherMode: "none" as const,
	ditherStrength: 0,
};

describe("batch processing", () => {
	it("selects an automatic route independently for each image", () => {
		const native = image(220);
		const width = 32;
		const height = 32;
		const gradient = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const offset = (y * width + x) * 4;
				gradient[offset] = Math.round((x / (width - 1)) * 255);
				gradient[offset + 1] = Math.round((y / (height - 1)) * 255);
				gradient[offset + 2] = Math.round(((x + y) / 62) * 255);
				gradient[offset + 3] = 255;
			}
		}
		const options = {
			preRemoveBackground: false,
			postRemoveBackground: false,
			bgExtractionMethod: "none" as const,
			bgRemovalScope: "off" as const,
			trimToContent: false,
		};
		const result = processBatchImages(
			[
				{ id: "native", image: native, options },
				{
					id: "continuous",
					image: { width, height, data: gradient },
					options,
				},
			],
			batchOptions,
		);

		expect(result.items.map((item) => item.status)).toEqual(["done", "done"]);
		if (
			result.items[0].status === "error" ||
			result.items[1].status === "error"
		) {
			throw new Error("Expected successful batch results");
		}
		expect(result.items[0].processResult.analysis.route).toBe("preserve");
		expect(result.items[1].processResult.analysis.route).toBe("convert");
	});

	it("isolates an image failure and continues later items", () => {
		const process: BatchImageProcessor = (source) => {
			if (source.data[0] === 2) throw new Error("broken image");
			return resultFor(source);
		};
		const result = processBatchImages(
			[1, 2, 3].map((value) => ({
				id: String(value),
				image: image(value),
				options: {},
			})),
			batchOptions,
			process,
		);

		expect(result.items.map((item) => item.status)).toEqual([
			"done",
			"error",
			"done",
		]);
		expect(result.items[1]).toEqual({
			id: "2",
			status: "error",
			error: "broken image",
		});
	});

	it("derives a shared palette before reduction and reapplies the same route", () => {
		const seenOptions: Array<{
			reduceColors?: boolean;
			hasPalette: boolean;
			outlineStyle?: string;
		}> = [];
		const process: BatchImageProcessor = (source, options) => {
			seenOptions.push({
				reduceColors: options.reduceColors,
				hasPalette: options.fixedPalette !== undefined,
				outlineStyle: options.outlineStyle,
			});
			return resultFor(source);
		};
		const result = processBatchImages(
			[1, 2].map((value) => ({
				id: String(value),
				image: image(value * 100),
				options: { reduceColors: true, fixedPalette: [{ r: 0, g: 0, b: 0 }] },
			})),
			{ ...batchOptions, sharedPalette: true },
			process,
		);

		expect(seenOptions).toEqual([
			{ reduceColors: false, hasPalette: false, outlineStyle: "none" },
			{ reduceColors: false, hasPalette: false, outlineStyle: "none" },
			{ reduceColors: true, hasPalette: true, outlineStyle: undefined },
			{ reduceColors: true, hasPalette: true, outlineStyle: undefined },
		]);
		expect(result.sharedPalette).toHaveLength(2);
		expect(result.items.every((item) => item.status === "done")).toBe(true);
	});

	it("adds an explicit outline after applying the shared palette", () => {
		const result = processBatchImages(
			[
				{
					id: "outlined",
					image: solidPixel(0, 0, 0),
					options: {
						processingMode: "preserve",
						enableGridDetection: false,
						outlineStyle: "sharp",
						outlineColor: { r: 255, g: 255, b: 255 },
					},
				},
				{
					id: "companion",
					image: solidPixel(255, 0, 0),
					options: { processingMode: "preserve", enableGridDetection: false },
				},
			],
			{ ...batchOptions, sharedPalette: true },
		);
		const outlined = result.items[0];
		if (outlined.status === "error") throw new Error(outlined.error);
		const colors = new Set<string>();
		for (
			let offset = 0;
			offset < outlined.processResult.result.data.length;
			offset += 4
		) {
			const data = outlined.processResult.result.data;
			colors.add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
		}
		expect(colors).toContain("255,255,255");
	});

	it("marks only low-confidence analyses for attention", () => {
		const safe = resultFor(image(1)).analysis;
		const uncertain = {
			...safe,
			classificationReasons: ["LOW_CLASSIFICATION_CONFIDENCE" as const],
		};
		const lowGrid = { ...safe, warnings: ["LOW_GRID_CONFIDENCE" as const] };

		expect(needsBatchAttention(safe)).toBe(false);
		expect(needsBatchAttention(uncertain)).toBe(true);
		expect(needsBatchAttention(lowGrid)).toBe(true);
	});
});
