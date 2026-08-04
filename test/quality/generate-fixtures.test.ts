import path from "node:path";
import { describe, it } from "vitest";
import { processBatchImages } from "../../src/core/batch";
import { rotateRawImageExpanded } from "../../src/core/deskew";
import { processImage } from "../../src/core/processor";
import type { RawImage } from "../../src/shared/types";
import {
	addDeterministicNoise,
	addPadding,
	boxBlur,
	createContinuousGradient,
	createReferenceSprite,
	cropShift,
	resizeBilinear,
	resizeNearest,
} from "./degradations";
import { readPng, writePng } from "./image";

const enabled = process.env.UPDATE_QUALITY_FIXTURES === "1";
const fixturePath = (name: string): string =>
	path.resolve("test/fixtures", name);

const createQuantizationInput = (): RawImage => {
	const width = 32;
	const height = 32;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const offset = (y * width + x) * 4;
			data[offset] = (x * 37 + y * 11) % 256;
			data[offset + 1] = (x * 17 + y * 53 + 29) % 256;
			data[offset + 2] = (x * 71 + y * 23 + 83) % 256;
			data[offset + 3] = (x + y) % 13 === 0 ? 0 : 255;
		}
	}
	return { width, height, data };
};

const createSharedPaletteTarget = (): RawImage => {
	const width = 16;
	const height = 16;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			const subject = x >= 4 && x < 12 && y >= 4 && y < 12;
			const accent = x === 11 && y === 4;
			data[offset] = accent ? 20 : subject ? 30 : 220;
			data[offset + 1] = accent ? 235 : 40;
			data[offset + 2] = accent ? 40 : subject ? 220 : 30;
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
};

const createSharedPaletteCompanion = (): RawImage => {
	const width = 96;
	const height = 96;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			const left = x < width / 2;
			data[offset] = left ? 230 : 40;
			data[offset + 1] = left ? 50 : 50;
			data[offset + 2] = left ? 35 : 210;
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
};

const addTransparentRgbPadding = (
	image: RawImage,
	padding: number,
): RawImage => {
	const width = image.width + padding * 2;
	const height = image.height + padding * 2;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const target = (y * width + x) * 4;
			data[target] = (x * 31 + y * 17) % 256;
			data[target + 1] = (x * 13 + y * 47) % 256;
			data[target + 2] = (x * 59 + y * 7) % 256;
		}
	}
	for (let y = 0; y < image.height; y += 1) {
		const sourceStart = y * image.width * 4;
		const targetStart = ((y + padding) * width + padding) * 4;
		data.set(
			image.data.subarray(sourceStart, sourceStart + image.width * 4),
			targetStart,
		);
	}
	return { width, height, data };
};

const createOpaqueGrid = (): RawImage => {
	const width = 8;
	const height = 8;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const target = (y * width + x) * 4;
			const value = (x + y) % 2 === 0 ? 32 : 224;
			data[target] = value;
			data[target + 1] = (value + x * 16) % 256;
			data[target + 2] = (value + y * 16) % 256;
			data[target + 3] = 255;
		}
	}
	return { width, height, data };
};

const createAmbiguousAxisGrid = (scale: number): RawImage => {
	const width = 8 * scale;
	const height = 8 * scale;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const value = Math.floor(x / scale) % 2 === 0 ? 32 : 224;
			const target = (y * width + x) * 4;
			data[target] = value;
			data[target + 1] = value;
			data[target + 2] = value;
			data[target + 3] = 255;
		}
	}
	return { width, height, data };
};

const createUiLowConfidenceInput = (): RawImage => {
	const width = 64;
	const height = 64;
	const padding = 8;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			const inside =
				x >= padding &&
				x < width - padding &&
				y >= padding &&
				y < height - padding;
			if (!inside) {
				data[offset] = 236;
				data[offset + 1] = 242;
				data[offset + 2] = 248;
				data[offset + 3] = 255;
				continue;
			}
			const localX = x - padding;
			const localY = y - padding;
			const accent = (localX * 3 + localY * 5) % 17 < 3;
			data[offset] = accent ? 224 : 32;
			data[offset + 1] = accent ? 96 : 48;
			data[offset + 2] = accent ? 80 : 72;
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
};

const createAutomaticBackgroundInput = (): RawImage => {
	const width = 24;
	const height = 24;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			const subject = x >= 7 && x <= 16 && y >= 7 && y <= 16;
			data[offset] = subject ? 32 : 224 + x;
			data[offset + 1] = subject ? 48 : 226 + y;
			data[offset + 2] = subject ? 80 : 232 + ((x + y) % 5);
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
};

const createContinuousIllustration = (): RawImage => {
	const width = 72;
	const height = 48;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			const face = (x - 36) ** 2 / 324 + (y - 25) ** 2 / 256 <= 1;
			const hair = (x - 36) ** 2 / 484 + (y - 20) ** 2 / 324 <= 1;
			const eye = y >= 23 && y <= 25 && (x === 30 || x === 42);
			const backgroundR = 72 + Math.round((x / (width - 1)) * 96);
			const backgroundG = 112 + Math.round((y / (height - 1)) * 96);
			data[offset] = eye ? 16 : face ? 232 + (x % 12) : hair ? 40 : backgroundR;
			data[offset + 1] = eye
				? 24
				: face
					? 168 + (y % 24)
					: hair
						? 64 + (x % 32)
						: backgroundG;
			data[offset + 2] = eye ? 48 : face ? 144 : hair ? 112 : 216;
			data[offset + 3] = x < 4 ? x * 64 : 255;
		}
	}
	return { width, height, data };
};

const createEnsembleSignalGrid = (
	scale: number,
	mode: "alpha" | "diagonal" | "harmonic",
): RawImage => {
	const logicalSize = 8;
	const width = logicalSize * scale;
	const height = logicalSize * scale;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const logicalY = Math.floor(y / scale);
		for (let x = 0; x < width; x += 1) {
			const logicalX = Math.floor(x / scale);
			const target = (y * width + x) * 4;
			let value = 128;
			let alpha = 255;
			if (mode === "alpha") {
				alpha = (logicalX + logicalY) % 2 === 0 ? 96 : 224;
			} else if (mode === "diagonal") {
				value =
					Math.abs(logicalX - logicalY) <= 1 || (logicalX + logicalY) % 5 === 0
						? 220
						: 40;
			} else {
				value =
					(Math.floor(logicalX / 2) + Math.floor(logicalY / 2)) % 2 === 0
						? 48
						: 208;
				if ((logicalX + logicalY * 2) % 3 === 0) value += 48;
			}
			data[target] = value;
			data[target + 1] = mode === "diagonal" ? (value + 24) % 256 : value;
			data[target + 2] = mode === "diagonal" ? (value + 48) % 256 : value;
			data[target + 3] = alpha;
		}
	}
	return { width, height, data };
};

const createCellSamplingFixtures = (): {
	input: RawImage;
	expected: RawImage;
} => {
	const logicalWidth = 6;
	const logicalHeight = 6;
	const scale = 4;
	const input = new Uint8ClampedArray(
		logicalWidth * scale * logicalHeight * scale * 4,
	);
	const expected = new Uint8ClampedArray(logicalWidth * logicalHeight * 4);
	const background = [16, 20, 32, 255] as const;
	for (let logicalY = 0; logicalY < logicalHeight; logicalY += 1) {
		for (let logicalX = 0; logicalX < logicalWidth; logicalX += 1) {
			const boundary = logicalX === 0 || logicalX === logicalWidth - 1;
			const line = logicalY === 2 && logicalX >= 1 && logicalX <= 4;
			const highlight =
				(logicalX === 2 && logicalY === 3) ||
				(logicalX === 3 && logicalY === 4);
			const expectedOffset = (logicalY * logicalWidth + logicalX) * 4;
			const feature = line
				? ([248, 184, 48, 255] as const)
				: highlight
					? ([80, 224, 248, 255] as const)
					: background;
			expected[expectedOffset] = boundary ? 224 : feature[0];
			expected[expectedOffset + 1] = boundary ? 64 : feature[1];
			expected[expectedOffset + 2] = boundary ? 48 : feature[2];
			expected[expectedOffset + 3] = boundary ? 64 : feature[3];

			for (let localY = 0; localY < scale; localY += 1) {
				for (let localX = 0; localX < scale; localX += 1) {
					const x = logicalX * scale + localX;
					const y = logicalY * scale + localY;
					const inputOffset = (y * logicalWidth * scale + x) * 4;
					const onFeature =
						(line && localY === 1) ||
						(highlight && localX === localY) ||
						(boundary && localY === 1);
					const color = onFeature ? feature : background;
					input[inputOffset] = boundary && onFeature ? 224 : color[0];
					input[inputOffset + 1] = boundary && onFeature ? 64 : color[1];
					input[inputOffset + 2] = boundary && onFeature ? 48 : color[2];
					input[inputOffset + 3] = boundary ? (onFeature ? 255 : 0) : 255;
					if (boundary && !onFeature) {
						// [Intended] 完全透明画素のRGBが復元色へ混入しないことも同時に検証する。
						input[inputOffset] = 32;
						input[inputOffset + 1] = 240;
						input[inputOffset + 2] = 96;
					}
				}
			}
		}
	}
	return {
		input: {
			width: logicalWidth * scale,
			height: logicalHeight * scale,
			data: input,
		},
		expected: { width: logicalWidth, height: logicalHeight, data: expected },
	};
};

const createSmallComponentInput = (
	includeProtectedDetails: boolean,
	includeNoise: boolean,
): RawImage => {
	const width = 16;
	const height = 16;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			const subject = x >= 5 && x <= 10 && y >= 5 && y <= 11;
			const eyes = includeProtectedDetails && y === 3 && (x === 6 || x === 9);
			const dakuten =
				includeProtectedDetails && y === 7 && (x === 12 || x === 14);
			const star = includeProtectedDetails && x === 2 && y === 2;
			const spark = includeProtectedDetails && x === 3 && y === 13;
			const noise = includeNoise && x === 14 && y === 14;
			const foreground = subject || eyes || dakuten || star || spark || noise;
			const value = noise ? 240 : subject ? 40 : 224;
			data[offset] = foreground ? value : 255;
			data[offset + 1] = foreground ? (noise ? 240 : 80) : 255;
			data[offset + 2] = foreground ? (noise ? 240 : 120) : 255;
			data[offset + 3] = noise ? 32 : 255;
		}
	}
	return { width, height, data };
};

const createUncertainSmallComponentInput = (): RawImage => {
	const width = 20;
	const height = 20;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			data[offset] = (x * 73 + y * 41) % 256;
			data[offset + 1] = (x * 19 + y * 101) % 256;
			data[offset + 2] = (x * 151 + y * 7) % 256;
			data[offset + 3] = x === 18 && y === 18 ? 32 : 255;
		}
	}
	return { width, height, data };
};

describe.skipIf(!enabled)("quality fixture generator", () => {
	it("writes deterministic generated-code fixtures", () => {
		const reference = createReferenceSprite();
		writePng(fixturePath("quality_reference.png"), reference);

		for (const scale of [2, 3, 4, 8, 16, 32]) {
			writePng(
				fixturePath(`quality_nearest_${scale}x.png`),
				resizeNearest(reference, scale),
			);
		}
		for (const [label, scale] of [
			["1_5x", 1.5],
			["2_5x", 2.5],
			["3_2x", 3.2],
		] as const) {
			writePng(
				fixturePath(`quality_nearest_${label}.png`),
				resizeNearest(reference, scale),
			);
		}

		const nearest4x = resizeNearest(reference, 4);
		const nearest16x = resizeNearest(reference, 16);
		for (const [label, angle] of [
			["neg-3", -3],
			["neg-1", -1],
			["neg-0-25", -0.25],
			["pos-0-25", 0.25],
			["pos-1", 1],
			["pos-3", 3],
		] as const) {
			writePng(
				fixturePath(`quality-prf500-rotated-${label}.png`),
				rotateRawImageExpanded(nearest16x, angle),
			);
		}
		const opaqueGrid = createOpaqueGrid();
		writePng(fixturePath("quality_transparent_rgb_expected.png"), opaqueGrid);
		writePng(
			fixturePath("quality_transparent_rgb_padding.png"),
			addTransparentRgbPadding(resizeNearest(opaqueGrid, 4), 8),
		);
		writePng(fixturePath("quality_bilinear.png"), resizeBilinear(reference, 4));
		writePng(
			fixturePath("quality_bicubic_equivalent.png"),
			boxBlur(resizeBilinear(reference, 4), 1),
		);
		writePng(fixturePath("quality_gaussian_blur.png"), boxBlur(nearest4x, 2));
		writePng(
			fixturePath("quality_rgb_noise.png"),
			addDeterministicNoise(nearest4x, 10),
		);
		writePng(fixturePath("quality_alpha_blur.png"), boxBlur(nearest4x, 1));
		for (const shift of [1, 2, 3]) {
			writePng(
				fixturePath(`quality_crop_shift_${shift}px.png`),
				cropShift(nearest4x, shift),
			);
		}
		writePng(
			fixturePath("quality_padding_white.png"),
			addPadding(nearest4x, 8, () => [255, 255, 255, 255]),
		);
		writePng(
			fixturePath("quality_padding_black.png"),
			addPadding(nearest4x, 8, () => [0, 0, 0, 255]),
		);
		writePng(
			fixturePath("quality_padding_solid.png"),
			addPadding(nearest4x, 8, () => [72, 96, 120, 255]),
		);
		writePng(
			fixturePath("quality_padding_gradient.png"),
			addPadding(nearest4x, 8, (x, y, width, height) => [
				Math.round((x / (width - 1)) * 90) + 120,
				Math.round((y / (height - 1)) * 80) + 130,
				180,
				255,
			]),
		);
		writePng(
			fixturePath("quality_anisotropic.png"),
			resizeNearest(reference, 4, 3),
		);
		writePng(
			fixturePath("quality_prf110_anisotropic_noninteger.png"),
			resizeNearest(reference, 2.5, 3.2),
		);

		const gradient = createContinuousGradient();
		writePng(fixturePath("quality_continuous_tone.png"), gradient);
		const { result: gradientConverted } = processImage(gradient, {
			processingMode: "convert",
			detailLevel: "balanced",
			preRemoveBackground: false,
			postRemoveBackground: false,
			bgRemovalScope: "off",
			bgExtractionMethod: "none",
			trimToContent: false,
		});
		writePng(
			fixturePath("quality_continuous_tone-convert-expect.png"),
			gradientConverted,
		);
		const illustration = createContinuousIllustration();
		writePng(fixturePath("quality_convert_illustration.png"), illustration);
		const { result: illustrationConverted } = processImage(illustration, {
			processingMode: "convert",
			detailLevel: "detailed",
			preRemoveBackground: false,
			postRemoveBackground: false,
			bgRemovalScope: "off",
			bgExtractionMethod: "none",
			trimToContent: false,
		});
		writePng(
			fixturePath("quality_convert_illustration-expect.png"),
			illustrationConverted,
		);
		writePng(
			fixturePath("quality_ambiguous_axis_grid.png"),
			createAmbiguousAxisGrid(4),
		);
		writePng(
			fixturePath("quality_ambiguous_axis_grid-expect.png"),
			createAmbiguousAxisGrid(1),
		);
		const uiLowConfidence = createUiLowConfidenceInput();
		writePng(
			fixturePath("quality_prf400_ui_low_confidence.png"),
			uiLowConfidence,
		);
		const { result: uiLowConfidenceExpected } = processImage(uiLowConfidence, {
			// [Intended] UI既定値の3%をピクセル数へ変換した値だけを明示し、その他は共有既定値を使う。
			floatingMaxPixels: Math.ceil(
				uiLowConfidence.width * uiLowConfidence.height * 0.03,
			),
		});
		writePng(
			fixturePath("quality_prf400_ui_low_confidence-expect.png"),
			uiLowConfidenceExpected,
		);
		for (const mode of ["alpha", "diagonal", "harmonic"] as const) {
			const ensembleInput =
				mode === "diagonal"
					? resizeBilinear(createEnsembleSignalGrid(1, mode), 4)
					: createEnsembleSignalGrid(4, mode);
			writePng(fixturePath(`quality_prf120_${mode}_grid.png`), ensembleInput);
			writePng(
				fixturePath(`quality_prf120_${mode}_grid-expect.png`),
				createEnsembleSignalGrid(1, mode),
			);
		}
		const cellSampling = createCellSamplingFixtures();
		writePng(
			fixturePath("quality_prf130_cell_sampling.png"),
			cellSampling.input,
		);
		writePng(
			fixturePath("quality_prf130_cell_sampling-expect.png"),
			cellSampling.expected,
		);

		const automaticBackground = createAutomaticBackgroundInput();
		writePng(
			fixturePath("quality_prf200_gradient_background.png"),
			automaticBackground,
		);
		const { result: automaticBackgroundExpected } = processImage(
			automaticBackground,
			{
				enableGridDetection: false,
				preRemoveBackground: true,
				postRemoveBackground: false,
				trimToContent: false,
				bgRemovalScope: "outer",
				bgExtractionMethod: "auto",
				backgroundTolerance: 64,
			},
		);
		writePng(
			fixturePath("quality_prf200_gradient_background-expect.png"),
			automaticBackgroundExpected,
		);

		const sharedPaletteTarget = createSharedPaletteTarget();
		const sharedPaletteCompanion = createSharedPaletteCompanion();
		writePng(
			fixturePath("quality_prf420_shared_palette_target.png"),
			sharedPaletteTarget,
		);
		writePng(
			fixturePath("quality_prf420_shared_palette_companion.png"),
			sharedPaletteCompanion,
		);
		const sharedPaletteOptions = {
			processingMode: "preserve" as const,
			enableGridDetection: false,
			bgExtractionMethod: "none" as const,
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
		};
		const sharedPaletteBatch = processBatchImages(
			[
				{
					id: "target",
					image: sharedPaletteTarget,
					options: sharedPaletteOptions,
				},
				{
					id: "companion",
					image: sharedPaletteCompanion,
					options: sharedPaletteOptions,
				},
			],
			{
				sharedPalette: true,
				colorCount: 4,
				ditherMode: "none",
				ditherStrength: 0,
			},
		);
		const sharedPalettePrimary = sharedPaletteBatch.items[0];
		if (!sharedPalettePrimary || sharedPalettePrimary.status === "error") {
			throw new Error("Failed to generate PRF-420 shared-palette fixture");
		}
		const sharedPaletteExpected = sharedPalettePrimary.processResult.result;
		let changed = false;
		for (
			let offset = 0;
			offset < sharedPaletteTarget.data.length;
			offset += 1
		) {
			if (
				sharedPaletteTarget.data[offset] !== sharedPaletteExpected.data[offset]
			) {
				changed = true;
				break;
			}
		}
		if (!changed) {
			throw new Error("PRF-420 fixture must exercise palette clustering");
		}
		const accentOffset = (4 * sharedPaletteTarget.width + 11) * 4;
		for (let channel = 0; channel < 4; channel += 1) {
			if (
				sharedPaletteTarget.data[accentOffset + channel] !==
				sharedPaletteExpected.data[accentOffset + channel]
			) {
				throw new Error("PRF-420 fixture must retain the target accent color");
			}
		}
		writePng(
			fixturePath("quality_prf420_shared_palette_target-expect.png"),
			sharedPaletteExpected,
		);

		const protectedDetails = createSmallComponentInput(true, false);
		writePng(
			fixturePath("quality_prf210_protected_details.png"),
			protectedDetails,
		);
		const commonSmallComponentOptions = {
			processingMode: "preserve" as const,
			preRemoveBackground: false,
			postRemoveBackground: true,
			trimToContent: false,
			bgRemovalScope: "outer" as const,
			bgExtractionMethod: "top-left" as const,
			backgroundTolerance: 0,
		};
		const { result: protectedDetailsExpected } = processImage(
			protectedDetails,
			{
				...commonSmallComponentOptions,
				smallComponentMode: "off",
			},
		);
		writePng(
			fixturePath("quality_prf210_protected_details-expect.png"),
			protectedDetailsExpected,
		);

		const isolatedNoise = createSmallComponentInput(false, true);
		writePng(fixturePath("quality_prf210_isolated_noise.png"), isolatedNoise);
		const { result: isolatedNoiseExpected } = processImage(
			createSmallComponentInput(false, false),
			{ ...commonSmallComponentOptions, smallComponentMode: "off" },
		);
		writePng(
			fixturePath("quality_prf210_isolated_noise-expect.png"),
			isolatedNoiseExpected,
		);

		const uncertainBackground = createUncertainSmallComponentInput();
		writePng(
			fixturePath("quality_prf210_uncertain_background.png"),
			uncertainBackground,
		);
		writePng(
			fixturePath("quality_prf210_uncertain_background-expect.png"),
			uncertainBackground,
		);

		const quantizationInput = createQuantizationInput();
		writePng(
			fixturePath("quality_deterministic_quantization.png"),
			quantizationInput,
		);
		const { result: quantizationExpected } = processImage(quantizationInput, {
			reduceColors: true,
			reduceColorMode: "auto",
			colorCount: 8,
			ditherMode: "ordered",
			ditherStrength: 100,
			enableGridDetection: false,
			bgExtractionMethod: "none",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
		});
		writePng(
			fixturePath("quality_deterministic_quantization-expect.png"),
			quantizationExpected,
		);

		for (const name of ["wide_red", "tall_red"]) {
			const input = readPng(fixturePath(`${name}.png`));
			const { result } = processImage(input, {
				trimToContent: false,
				preRemoveBackground: false,
				postRemoveBackground: false,
				makeSquare: true,
				enableGridDetection: false,
			});
			writePng(fixturePath(`${name}-expect.png`), result);
		}
	});
});
