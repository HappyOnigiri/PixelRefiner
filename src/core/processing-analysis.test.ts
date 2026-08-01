import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
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
			totalScore: processed.grid.score,
		});
		expect(
			processed.analysis.gridCandidates.every(
				(candidate) => candidate.confidence >= 0 && candidate.confidence <= 1,
			),
		).toBe(true);
	});

	it("warns when detection succeeds on only one axis", () => {
		const processed = processImage(stripedImage(), {
			autoGridFromTrimmed: false,
			backgroundMask: false,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
		});

		expect(processed.grid.detectionFailedAxes).toEqual(["y"]);
		expect(processed.analysis.warnings).toContain("ONE_AXIS_DETECTION_FAILED");
	});

	it("warns about content loss and empty input", () => {
		const removed = processImage(solidImage(8, 8, [255, 255, 255, 255]), {
			enableGridDetection: false,
			preRemoveBackground: true,
			bgRemovalScope: "all",
			backgroundTolerance: 0,
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
