import { describe, expect, it } from "vitest";
import type { GridCandidateReport, RawImage } from "../shared/types";
import {
	classifyInput,
	routeForClassification,
	selectAutoProcessingRoute,
} from "./classifier";

const createPixelArt = (logicalSize: number, scale: number): RawImage => {
	const width = logicalSize * scale;
	const height = logicalSize * scale;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const logicalY = Math.floor(y / scale);
		for (let x = 0; x < width; x += 1) {
			const logicalX = Math.floor(x / scale);
			const index = (y * width + x) * 4;
			const value = (logicalX * 71 + logicalY * 43) % 256;
			data[index] = value;
			data[index + 1] = (value + logicalX * 17) % 256;
			data[index + 2] = (value + logicalY * 29) % 256;
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

const createNativePixelArt = (): RawImage => {
	const image = createPixelArt(4, 2);
	for (let i = 0; i < image.data.length; i += 4) {
		const value = image.data[i] < 128 ? 32 : 224;
		image.data[i] = value;
		image.data[i + 1] = value;
		image.data[i + 2] = value;
	}
	return image;
};

// 行内は同色で、列方向にだけ滑らかに変化する画像。
const createColumnGradient = (): RawImage => {
	const width = 32;
	const height = 32;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const value = y * 7;
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			data[index] = value;
			data[index + 1] = (value + 40) % 256;
			data[index + 2] = (value + 80) % 256;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};

const rotateQuarterTurn = (image: RawImage): RawImage => {
	const { width, height } = image;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const source = (y * width + x) * 4;
			const target = (x * height + (height - 1 - y)) * 4;
			data[target] = image.data[source];
			data[target + 1] = image.data[source + 1];
			data[target + 2] = image.data[source + 2];
			data[target + 3] = image.data[source + 3];
		}
	}
	return { width: height, height: width, data };
};

const candidate = (
	image: RawImage,
	cell: number,
	confidence: number,
): GridCandidateReport => ({
	grid: { cellW: cell, cellH: cell, offsetX: 0, offsetY: 0, score: 0 },
	outW: image.width / cell,
	outH: image.height / cell,
	cropX: 0,
	cropY: 0,
	cropW: image.width,
	cropH: image.height,
	method: "test-grid",
	totalScore: confidence,
	confidence,
});

describe("input classifier", () => {
	it("classifies native pixel art without inventing a scale", () => {
		const classification = classifyInput(createNativePixelArt());

		expect(classification.classification).toBe("native-pixel");
		expect(classification.reasons).toEqual(["NATIVE_PIXEL_STRUCTURE"]);
	});

	it("classifies a confident repeated grid as scaled pixel art", () => {
		const image = createPixelArt(8, 4);
		const classification = classifyInput(image, [candidate(image, 4, 0.8)]);

		expect(classification.classification).toBe("scaled-pixel");
		expect(classification.features.gridScale).toBe(4);
	});

	it("classifies smooth high-color input as continuous tone", () => {
		const classification = classifyInput(createContinuousImage());

		expect(classification.classification).toBe("continuous");
		expect(classification.features.smoothGradientRatio).toBeGreaterThan(0.9);
	});

	it("keeps tiny inputs uncertain", () => {
		const image: RawImage = {
			width: 1,
			height: 1,
			data: new Uint8ClampedArray([0, 0, 0, 0]),
		};

		expect(classifyInput(image).classification).toBe("uncertain");
	});

	it("ignores RGB values in fully transparent pixels", () => {
		const clear = createNativePixelArt();
		const noisy = createNativePixelArt();
		for (let i = 0; i < clear.data.length; i += 4) {
			if (i % 12 !== 0) continue;
			clear.data[i] = 0;
			clear.data[i + 1] = 0;
			clear.data[i + 2] = 0;
			clear.data[i + 3] = 0;
			noisy.data[i] = (i * 31) % 256;
			noisy.data[i + 1] = (i * 47) % 256;
			noisy.data[i + 2] = (i * 59) % 256;
			noisy.data[i + 3] = 0;
		}

		expect(classifyInput(noisy)).toEqual(classifyInput(clear));
	});

	it.each([
		["native-pixel", "preserve"],
		["scaled-pixel", "refine"],
		["soft-pixel", "refine"],
		["continuous", "convert"],
		["uncertain", "preserve"],
	] as const)("routes %s to %s", (classification, route) => {
		expect(routeForClassification(classification)).toBe(route);
	});

	it("classifies an image and its rotation the same way", () => {
		const columnGradient = createColumnGradient();

		expect(classifyInput(columnGradient).classification).toBe(
			classifyInput(rotateQuarterTurn(columnGradient)).classification,
		);
	});

	it("falls back from a low-confidence refine decision", () => {
		const decision = selectAutoProcessingRoute("soft-pixel", 0.25);

		expect(decision).toEqual({
			route: "preserve",
			fellBackToPreserve: true,
		});
	});

	it("keeps refine when the applied grid is confident enough", () => {
		const decision = selectAutoProcessingRoute("soft-pixel", 0.45);

		expect(decision).toEqual({
			route: "refine",
			fellBackToPreserve: false,
		});
	});

	it("falls back when no candidate matches the applied grid", () => {
		const decision = selectAutoProcessingRoute("scaled-pixel", undefined);

		expect(decision).toEqual({
			route: "preserve",
			fellBackToPreserve: true,
		});
	});
});
