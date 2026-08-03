import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { estimateBackgroundModel } from "./background";
import { createProcessingAnalysis } from "./processing-analysis";
import { processImage } from "./processor";

const solidImage = (
	width: number,
	height: number,
	rgba: readonly [number, number, number, number],
): RawImage => {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = rgba[0];
		data[i + 1] = rgba[1];
		data[i + 2] = rgba[2];
		data[i + 3] = rgba[3];
	}
	return { width, height, data };
};

const stripedImage = (): RawImage => {
	const width = 32;
	const height = 32;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const value = Math.floor(x / 4) % 2 === 0 ? 0 : 255;
			const i = (y * width + x) * 4;
			data[i] = value;
			data[i + 1] = value;
			data[i + 2] = value;
			data[i + 3] = 255;
		}
	}
	return { width, height, data };
};

const noisyImage = (): RawImage => {
	const width = 20;
	const height = 20;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			data[offset] = (x * 73 + y * 41) % 256;
			data[offset + 1] = (x * 19 + y * 101) % 256;
			data[offset + 2] = (x * 151 + y * 7) % 256;
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
};

const pixelArtOnGradient = (): RawImage => {
	const width = 32;
	const height = 32;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			const inSubject = x >= 8 && x < 24 && y >= 8 && y < 24;
			if (inSubject) {
				const value =
					(Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 40 : 90;
				data[offset] = value;
				data[offset + 1] = value;
				data[offset + 2] = value + 20;
			} else {
				data[offset] = 226 + Math.floor(x / 8);
				data[offset + 1] = 228 + Math.floor(y / 8);
				data[offset + 2] = 234;
			}
			data[offset + 3] = 255;
		}
	}
	return { width, height, data };
};

describe("processing analysis", () => {
	it("reports convert and preserve routes", () => {
		const image = solidImage(16, 16, [20, 40, 60, 255]);
		const converted = processImage(image, {
			forcePixelsW: 4,
			forcePixelsH: 4,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
		});
		const preserved = processImage(image, {
			enableGridDetection: false,
			bgRemovalScope: "off",
			preRemoveBackground: false,
		});

		expect(converted.analysis.route).toBe("convert");
		expect(converted.analysis.confidence).toBe(1);
		expect(preserved.analysis.route).toBe("preserve");
		expect(preserved.analysis.gridCandidates[0].method).toBe("grid-disabled");
	});

	it("exposes the selected grid and ranked candidates", () => {
		const image = stripedImage();
		const processed = processImage(image, {
			autoGridFromTrimmed: true,
			fastAutoGridFromTrimmed: true,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
		});

		expect(processed.analysis.route).toBe("refine");
		expect(processed.analysis.selectedCandidateIndex).toBe(0);
		expect(processed.analysis.gridCandidates.length).toBeGreaterThan(1);
		expect(processed.analysis.gridCandidates[0]).toMatchObject({
			outW: processed.grid.outW,
			outH: processed.grid.outH,
		});
		expect(
			processed.analysis.gridCandidates[
				processed.analysis.gridCandidates.length - 1
			].method,
		).toBe("preserve");
		expect(
			processed.analysis.gridCandidates.every(
				(candidate, index, candidates) =>
					index === 0 ||
					candidates[index - 1].totalScore >= candidate.totalScore,
			),
		).toBe(true);
		expect(
			Object.values(processed.analysis.gridCandidates[0].subscores ?? {}).every(
				(score) => score >= 0 && score <= 1,
			),
		).toBe(true);
		expect(
			processed.analysis.gridCandidates.every(
				(candidate) => candidate.confidence >= 0 && candidate.confidence <= 1,
			),
		).toBe(true);
	});

	it("warns when detection succeeds on only one axis", () => {
		const processed = processImage(stripedImage(), {
			processingMode: "refine",
			autoGridFromTrimmed: false,
			backgroundMask: false,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
		});

		expect(processed.grid.detectionFailedAxes).toEqual(["y"]);
		expect(processed.grid.outW).toBeGreaterThan(1);
		expect(processed.grid.outH).toBeGreaterThan(1);
		expect(processed.analysis.gridCandidates.length).toBeGreaterThan(1);
		expect(processed.analysis.warnings).toContain("ONE_AXIS_DETECTION_FAILED");
		expect(processed.analysis.warnings).toContain("LOW_GRID_CONFIDENCE");
		expect(processed.analysis.confidence).toBe(0);
		expect(processed.analysis.selectedCandidateIndex).toBeUndefined();
	});

	it("warns when grid detection cannot produce a reliable result", () => {
		const processed = processImage(solidImage(64, 64, [40, 80, 120, 255]), {
			processingMode: "refine",
			autoGridFromTrimmed: false,
			backgroundMask: false,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
		});

		expect(processed.grid.outW).toBe(64);
		expect(processed.grid.outH).toBe(64);
		expect(processed.analysis.gridCandidates.length).toBeGreaterThan(1);
		expect(
			processed.analysis.gridCandidates.some(
				(candidate) => candidate.method === "preserve",
			),
		).toBe(true);
		expect(processed.analysis.selectedCandidateIndex).toBeUndefined();
		expect(processed.analysis.warnings).toContain("LOW_GRID_CONFIDENCE");
	});

	it("warns when an unavoidable thin output has an extreme dimension", () => {
		const processed = processImage(solidImage(64, 1, [40, 80, 120, 255]), {
			autoGridFromTrimmed: false,
			backgroundMask: false,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
		});

		expect(processed.analysis.warnings).toContain("LOW_GRID_CONFIDENCE");
		expect(processed.analysis.warnings).toContain("EXTREME_OUTPUT_SIZE");
	});

	it("warns about content loss and empty input", () => {
		const removed = processImage(solidImage(8, 8, [255, 255, 255, 255]), {
			enableGridDetection: false,
			preRemoveBackground: true,
			bgRemovalScope: "all",
			backgroundTolerance: 0,
			bgExtractionMethod: "top-left",
		});
		const empty = processImage(solidImage(8, 8, [0, 0, 0, 0]), {
			enableGridDetection: false,
			preRemoveBackground: false,
			bgRemovalScope: "off",
		});

		expect(removed.analysis.contentLossRatio).toBe(1);
		expect(removed.analysis.warnings).toContain("CONTENT_LOSS_RISK");
		expect(empty.analysis.warnings).toContain("NO_CONTENT");
	});

	it("reports an automatic background rollback as a skipped removal", () => {
		const processed = processImage(solidImage(8, 8, [255, 255, 255, 255]), {
			enableGridDetection: false,
			preRemoveBackground: true,
			postRemoveBackground: true,
			trimToContent: false,
			bgRemovalScope: "all",
			bgExtractionMethod: "auto",
		});

		expect(processed.result.data).toEqual(
			solidImage(8, 8, [255, 255, 255, 255]).data,
		);
		expect(processed.analysis.backgroundConfidence).toBeDefined();
		expect(processed.analysis.warnings).toContain("BACKGROUND_REMOVAL_SKIPPED");
		expect(processed.analysis.warnings).not.toContain("CONTENT_LOSS_RISK");
	});

	it("hands the full-resolution background model to the post-processing removal", () => {
		const image = pixelArtOnGradient();
		const processed = processImage(image, {
			bgExtractionMethod: "auto",
			preRemoveBackground: false,
			postRemoveBackground: true,
			trimToContent: false,
		});

		// 事前除去が無効でも、診断は原寸画像から推定したモデルのものになる。
		expect(processed.analysis.backgroundConfidence).toBe(
			estimateBackgroundModel(image).confidence,
		);
		expect(processed.analysis.warnings).not.toContain(
			"BACKGROUND_REMOVAL_SKIPPED",
		);
		// 引き渡したモデルで後処理の背景除去が働き、外周は透明になる。
		expect(processed.result.data[3]).toBe(0);
	});

	it("warns and preserves pixels when automatic background confidence is low", () => {
		const image = noisyImage();
		const processed = processImage(image, {
			enableGridDetection: false,
			preRemoveBackground: true,
			postRemoveBackground: false,
			trimToContent: false,
			bgRemovalScope: "outer",
			bgExtractionMethod: "auto",
		});

		expect(processed.result.data).toEqual(image.data);
		expect(processed.analysis.warnings).toContain("BACKGROUND_UNCERTAIN");
	});

	it("does not treat transparent padding as content loss", () => {
		const processed = processImage(solidImage(10, 4, [255, 0, 0, 255]), {
			enableGridDetection: false,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			makeSquare: true,
		});

		expect(processed.result.width).toBe(10);
		expect(processed.result.height).toBe(10);
		expect(processed.analysis.contentLossRatio).toBe(0);
		expect(processed.analysis.warnings).not.toContain("CONTENT_LOSS_RISK");
	});

	it("keeps all alternatives in the detector coordinate space", () => {
		const stripes = stripedImage();
		const padded: RawImage = {
			width: 40,
			height: 32,
			data: new Uint8ClampedArray(40 * 32 * 4),
		};
		for (let y = 0; y < stripes.height; y += 1) {
			const sourceStart = y * stripes.width * 4;
			const targetStart = (y * padded.width + 4) * 4;
			padded.data.set(
				stripes.data.subarray(sourceStart, sourceStart + stripes.width * 4),
				targetStart,
			);
		}
		const processed = processImage(padded, {
			autoGridFromTrimmed: true,
			fastAutoGridFromTrimmed: true,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: true,
			makeSquare: true,
		});

		const candidates = processed.analysis.gridCandidates;
		expect(candidates.length).toBeGreaterThan(1);
		expect(candidates[0].outW).not.toBe(processed.grid.outW);
		expect(
			new Set(
				candidates.map(
					(candidate) =>
						`${candidate.outW}:${candidate.outH}:${candidate.totalScore}`,
				),
			).size,
		).toBe(candidates.length);
	});

	it("adds fallback warnings once even if already present", () => {
		const image = solidImage(8, 8, [10, 20, 30, 255]);
		const grid = {
			cellW: 1,
			cellH: 1,
			offsetX: 0,
			offsetY: 0,
			outW: 8,
			outH: 8,
			cropX: 0,
			cropY: 0,
			cropW: 8,
			cropH: 8,
			score: 0,
		};

		const analysis = createProcessingAnalysis(
			image,
			image,
			image,
			grid,
			"preserve",
			"auto-low-confidence-preserve",
			1,
			undefined,
			undefined,
			undefined,
			["FALLBACK_TO_PRESERVE", "FALLBACK_TO_PRESERVE"],
		);

		expect(
			analysis.warnings.filter((code) => code === "FALLBACK_TO_PRESERVE"),
		).toHaveLength(1);
	});

	it("is structured-clone compatible for worker transport", () => {
		const processed = processImage(solidImage(4, 4, [0, 0, 0, 255]), {
			enableGridDetection: false,
			bgRemovalScope: "off",
			preRemoveBackground: false,
		});

		const cloned = structuredClone(processed);
		expect(cloned.analysis).toEqual(processed.analysis);
		expect(cloned.result.data).toBeInstanceOf(Uint8ClampedArray);
	});
});
