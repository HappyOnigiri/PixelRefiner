import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { processImage } from "./processor";
import { readPngAsRawImage } from "./processor-test-helpers";

const createNativePixelArt = (width = 8, height = 8): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			const value =
				(Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 32 : 224;
			data[index] = value;
			data[index + 1] = value;
			data[index + 2] = value;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};

const createContinuousImage = (): RawImage => {
	const width = 32;
	const height = 32;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			data[index] = x * 7;
			data[index + 1] = y * 7;
			data[index + 2] = (x * 3 + y * 5) % 256;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};

const safeOptions = {
	debug: false,
	processingMode: "auto",
	preRemoveBackground: false,
	postRemoveBackground: false,
	bgRemovalScope: "off",
	bgExtractionMethod: "none",
	trimToContent: false,
} as const;

describe("processing router", () => {
	it("uses automatic routing when processingMode is omitted", () => {
		const { processingMode: _processingMode, ...defaultOptions } = safeOptions;
		const processed = processImage(createContinuousImage(), defaultOptions);

		expect(processed.analysis.classification).toBe("continuous");
		expect(processed.analysis.route).toBe("convert");
	});

	it("preserves native pixel art at its original size", () => {
		const image = createNativePixelArt();
		const processed = processImage(image, safeOptions);

		expect(processed.analysis.classification).toBe("native-pixel");
		expect(processed.analysis.route).toBe("preserve");
		expect(processed.result).toEqual(image);
		expect(processed.analysis.classificationReasons).toEqual([
			"NATIVE_PIXEL_STRUCTURE",
		]);
	});

	it("routes continuous tone through the balanced convert candidate", () => {
		const image = createContinuousImage();
		const processed = processImage(image, safeOptions);

		expect(processed.analysis.classification).toBe("continuous");
		expect(processed.analysis.route).toBe("convert");
		expect(processed.result.width).toBeLessThan(image.width);
		expect(processed.result.height).toBeLessThan(image.height);
		expect(processed.analysis.gridCandidates).toHaveLength(5);
		expect(processed.extractedPalette.length).toBeLessThanOrEqual(24);
	});

	it("selects visibly different convert sizes from all five size levels", () => {
		const image = createContinuousImage();
		const detailLevels = [
			"smallest",
			"small",
			"coarse",
			"balanced",
			"detailed",
		] as const;
		const results = detailLevels.map((detailLevel) =>
			processImage(image, {
				...safeOptions,
				processingMode: "convert",
				detailLevel,
			}),
		);

		for (let i = 1; i < results.length; i += 1) {
			expect(results[i - 1].result.width).toBeLessThan(results[i].result.width);
			expect(results[i - 1].result.height).toBeLessThan(
				results[i].result.height,
			);
		}
	});

	it.each([
		["transparent", 0],
		["single-color", 255],
	] as const)(
		"converts a %s image safely and deterministically",
		(_, alpha) => {
			const image: RawImage = {
				width: 8,
				height: 8,
				data: new Uint8ClampedArray(8 * 8 * 4),
			};
			for (let i = 0; i < image.data.length; i += 4) {
				image.data[i] = 48;
				image.data[i + 1] = 96;
				image.data[i + 2] = 144;
				image.data[i + 3] = alpha;
			}
			const options = { ...safeOptions, processingMode: "convert" } as const;
			const first = processImage(image, options);
			const second = processImage(image, options);

			expect(first.result).toEqual(second.result);
			expect(first.result.width).toBe(8);
			expect(first.result.height).toBe(8);
		},
	);

	it("derives convert candidate sizes from the trimmed subject", () => {
		const size = 64;
		const image: RawImage = {
			width: size,
			height: size,
			data: new Uint8ClampedArray(size * size * 4),
		};
		for (let y = 16; y < 48; y += 1) {
			for (let x = 16; x < 48; x += 1) {
				const index = (y * size + x) * 4;
				image.data[index] = x * 4;
				image.data[index + 1] = y * 4;
				image.data[index + 2] = (x * 3 + y * 5) % 256;
				image.data[index + 3] = 255;
			}
		}
		const options = { ...safeOptions, processingMode: "convert" } as const;
		const trimmed = processImage(image, { ...options, trimToContent: true });
		const untrimmed = processImage(image, { ...options, trimToContent: false });

		const opaqueWidth = (output: RawImage): number => {
			let min = output.width;
			let max = -1;
			for (let y = 0; y < output.height; y += 1) {
				for (let x = 0; x < output.width; x += 1) {
					if (output.data[(y * output.width + x) * 4 + 3] === 0) continue;
					min = Math.min(min, x);
					max = Math.max(max, x);
				}
			}
			return max < min ? 0 : max - min + 1;
		};

		// 余白込みで候補を算出すると被写体に割り当たる画素が減る。
		expect(opaqueWidth(trimmed.result)).toBeGreaterThan(
			opaqueWidth(untrimmed.result),
		);
		expect(trimmed.grid.cropX).toBe(16);
		expect(trimmed.grid.cropY).toBe(16);
	});

	it("selects the candidate matching the requested detail level in the report", () => {
		const image: RawImage = {
			width: 8,
			height: 8,
			data: new Uint8ClampedArray(8 * 8 * 4),
		};
		for (let i = 0; i < image.data.length; i += 4) {
			image.data[i] = i % 256;
			image.data[i + 1] = 128;
			image.data[i + 2] = 255 - (i % 256);
			image.data[i + 3] = 255;
		}
		const processed = processImage(image, {
			...safeOptions,
			processingMode: "convert",
			detailLevel: "detailed",
		});

		expect(processed.analysis.selectedCandidateIndex).toBe(4);
		expect(
			processed.analysis.gridCandidates[
				processed.analysis.selectedCandidateIndex ?? -1
			].method,
		).toBe("convert-detailed");
	});

	it("allows an explicit route to override automatic classification", () => {
		const processed = processImage(createContinuousImage(), {
			...safeOptions,
			processingMode: "preserve",
		});

		expect(processed.analysis.classification).toBeUndefined();
		expect(processed.analysis.route).toBe("preserve");
	});

	it("keeps an explicit convert route when grid detection is disabled", () => {
		const processed = processImage(createContinuousImage(), {
			...safeOptions,
			processingMode: "convert",
			enableGridDetection: false,
		});

		expect(processed.analysis.route).toBe("convert");
	});

	it("applies the requested outline on an automatic preserve route", () => {
		const image = createNativePixelArt();
		const processed = processImage(image, {
			...safeOptions,
			outlineStyle: "sharp",
		});

		expect(processed.analysis.route).toBe("preserve");
		expect(processed.result).not.toEqual(image);
	});

	it("applies the requested square padding on an automatic preserve route", () => {
		const processed = processImage(createNativePixelArt(12, 6), {
			...safeOptions,
			makeSquare: true,
		});

		expect(processed.analysis.route).toBe("preserve");
		expect(processed.result.width).toBe(12);
		expect(processed.result.height).toBe(12);
	});

	it("reports the grid metric and the classification metric separately", () => {
		const processed = processImage(createNativePixelArt(), safeOptions);

		expect(processed.analysis.classificationConfidence).toBeGreaterThan(0);
		expect(processed.analysis.confidence).toBe(0);
	});

	it.each([
		["quality_prf210_isolated_noise.png", 6, 7],
		["quality_prf210_protected_details.png", 13, 12],
		["quality_prf420_shared_palette_target.png", 8, 8],
		["quality_prf200_gradient_background.png", 10, 10],
	] as const)(
		"%s は縮退したグリッドを棄却して等倍へフォールバックする",
		async (fileName, width, height) => {
			const image = await readPngAsRawImage(
				fileURLToPath(
					new URL(`../../test/fixtures/${fileName}`, import.meta.url),
				),
			);
			// UI 既定（Auto プリセット）と同じ、PROCESS_DEFAULTS のままの処理。
			const processed = processImage(image, { debug: false });

			expect(processed.analysis.route).toBe("preserve");
			expect(processed.analysis.warnings).toContain("FALLBACK_TO_PRESERVE");
			// 棄却したグリッドも候補として提示できるよう、低信頼シグナルを残す。
			expect(processed.analysis.warnings).toContain("LOW_GRID_CONFIDENCE");
			expect(processed.result.width).toBe(width);
			expect(processed.result.height).toBe(height);
		},
	);

	it("繰り返しの足りない周期を退けて 4 画素セルの格子を復元する", async () => {
		const image = await readPngAsRawImage(
			fileURLToPath(
				new URL(
					"../../test/fixtures/quality_prf130_cell_sampling.png",
					import.meta.url,
				),
			),
		);
		const processed = processImage(image, {
			debug: false,
			cellSamplingMode: "alpha-aware-medoid",
		});

		expect(processed.analysis.route).toBe("refine");
		expect(processed.result.width).toBe(6);
		expect(processed.result.height).toBe(6);
	});

	it("整数倍拡大を戻す小さな出力は縮退とみなさない", () => {
		// 3x3 の論理ドットを 8 倍に拡大した 24x24。出力 3x3 は正しい復元。
		const scale = 8;
		const logical = 3;
		const size = logical * scale;
		const data = new Uint8ClampedArray(size * size * 4);
		for (let y = 0; y < size; y += 1) {
			for (let x = 0; x < size; x += 1) {
				const logicalX = Math.floor(x / scale);
				const logicalY = Math.floor(y / scale);
				const index = (y * size + x) * 4;
				data[index] = (logicalX * 90 + logicalY * 30) % 256;
				data[index + 1] = (logicalX * 40 + logicalY * 130) % 256;
				data[index + 2] = (logicalX * 170 + logicalY * 70) % 256;
				data[index + 3] = 255;
			}
		}
		const processed = processImage(
			{ width: size, height: size, data },
			{ ...safeOptions, sampleWindow: 1 },
		);

		expect(processed.analysis.route).toBe("refine");
		expect(processed.result.width).toBe(logical);
		expect(processed.result.height).toBe(logical);
	});

	it.each([
		["quality_reference.png", "native-pixel", "preserve", 8, 8],
		["quality_nearest_2x.png", "scaled-pixel", "refine", 8, 8],
		["quality_bilinear.png", "soft-pixel", "refine", 8, 8],
		["quality_continuous_tone.png", "continuous", "convert", 24, 16],
	] as const)(
		"classifies and routes the %s quality fixture",
		async (fileName, classification, route, width, height) => {
			const image = await readPngAsRawImage(
				fileURLToPath(
					new URL(`../../test/fixtures/${fileName}`, import.meta.url),
				),
			);
			const processed = processImage(image, {
				...safeOptions,
				cellSamplingMode: "legacy-median",
				sampleWindow: fileName === "quality_nearest_2x.png" ? 1 : 3,
			});

			expect(processed.analysis.classification).toBe(classification);
			expect(processed.analysis.route).toBe(route);
			expect(processed.result.width).toBe(width);
			expect(processed.result.height).toBe(height);
		},
	);
});
