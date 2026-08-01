import path from "node:path";
import { describe, it } from "vitest";
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

		const gradient = createContinuousGradient();
		writePng(fixturePath("quality_continuous_tone.png"), gradient);

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
