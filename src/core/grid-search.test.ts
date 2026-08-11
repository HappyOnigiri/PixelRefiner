import { describe, expect, it } from "vitest";
import { GRID_SEARCH_LIMITS } from "../shared/config";
import type { RawImage } from "../shared/types";
import {
	normalizeGridPhase,
	resolveGridEstimate,
	searchPhaseAwareGrid,
} from "./grid-search";
import { processImage } from "./processor";

const createScaledGrid = (
	logicalWidth: number,
	logicalHeight: number,
	cellW: number,
	cellH: number,
	cropLeft = 0,
	cropTop = 0,
): RawImage => {
	const fullWidth = Math.round(logicalWidth * cellW);
	const fullHeight = Math.round(logicalHeight * cellH);
	const width = fullWidth - cropLeft;
	const height = fullHeight - cropTop;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const logicalY = Math.min(
			logicalHeight - 1,
			Math.floor((y + cropTop) / cellH),
		);
		for (let x = 0; x < width; x += 1) {
			const logicalX = Math.min(
				logicalWidth - 1,
				Math.floor((x + cropLeft) / cellW),
			);
			const value =
				(logicalX * 73 + logicalY * 151 + logicalX * logicalY * 29) % 256;
			const index = (y * width + x) * 4;
			data[index] = value;
			data[index + 1] = (value * 3 + logicalX * 17) % 256;
			data[index + 2] = (value * 5 + logicalY * 31) % 256;
			data[index + 3] = 255;
		}
	}
	return { width, height, data };
};

const candidateSizes = (image: RawImage): Array<[number, number]> => {
	const estimate = searchPhaseAwareGrid(image, image);
	expect(estimate).not.toBeNull();
	if (!estimate) return [];
	return [estimate, ...(estimate.candidates ?? [])]
		.slice(0, 3)
		.map((candidate) => [candidate.outW, candidate.outH]);
};

const addTransparentPadding = (
	image: RawImage,
	left: number,
	top: number,
): RawImage => {
	const width = image.width + left;
	const height = image.height + top;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < image.height; y += 1) {
		const sourceStart = y * image.width * 4;
		const targetStart = ((y + top) * width + left) * 4;
		data.set(
			image.data.subarray(sourceStart, sourceStart + image.width * 4),
			targetStart,
		);
	}
	return { width, height, data };
};

const createSignalGrid = (
	logicalWidth: number,
	logicalHeight: number,
	cell: number,
	mode: "alpha" | "diagonal" | "harmonic",
): RawImage => {
	const width = logicalWidth * cell;
	const height = logicalHeight * cell;
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		const logicalY = Math.floor(y / cell);
		for (let x = 0; x < width; x += 1) {
			const logicalX = Math.floor(x / cell);
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

describe("phase-aware grid search", () => {
	it("detects independent axis scales and crop phase", () => {
		const image = createScaledGrid(8, 7, 4, 3, 3, 2);
		const estimate = searchPhaseAwareGrid(image, image);
		expect(estimate).not.toBeNull();
		if (!estimate) return;
		expect(estimate.cellW).toBeCloseTo(4, 4);
		expect(estimate.cellH).toBeCloseTo(3, 4);
		expect(estimate.offsetX).toBeCloseTo(1, 4);
		expect(estimate.offsetY).toBeCloseTo(1, 4);
		expect(estimate.outW).toBe(8);
		expect(estimate.outH).toBe(7);
	});

	it.each([
		[2, 2],
		[32, 32],
	] as const)("searches %sx by %sx cells", (cellW, cellH) => {
		const image = createScaledGrid(8, 7, cellW, cellH);
		expect(candidateSizes(image)).toContainEqual([8, 7]);
	});

	it.each([
		[2.5, 2.5],
		[3.2, 3.2],
		[7.75, 4.5],
	] as const)(
		"keeps the correct non-integer %sx by %sx size in the top three",
		(cellW, cellH) => {
			const image = createScaledGrid(8, 8, cellW, cellH);
			expect(candidateSizes(image)).toContainEqual([8, 8]);
		},
	);

	it("normalizes BBox-local phases into original-image coordinates", () => {
		expect(normalizeGridPhase(3 + 1, 4)).toBe(0);
		expect(normalizeGridPhase(2 + 1, 4)).toBe(3);
		expect(normalizeGridPhase(-1, 4)).toBe(3);
	});

	it("publishes a non-integer correct size in the processing Top-3", () => {
		const image = createScaledGrid(8, 8, 2.5, 3.2);
		const { analysis } = processImage(image, {
			autoGridFromTrimmed: true,
			fastAutoGridFromTrimmed: true,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
			sampleWindow: 1,
		});
		const topThree = analysis.gridCandidates
			.filter((candidate) => candidate.method !== "preserve")
			.slice(0, 3)
			.map((candidate) => [candidate.outW, candidate.outH]);
		expect(topThree).toContainEqual([8, 8]);
	});

	it.each([1, 2, 3])(
		"propagates a %spx BBox shift without changing full-image grid boundaries",
		(padding) => {
			const image = addTransparentPadding(
				createScaledGrid(8, 8, 4, 3),
				padding,
				padding,
			);
			const { analysis } = processImage(image, {
				autoGridFromTrimmed: true,
				fastAutoGridFromTrimmed: true,
				bgRemovalScope: "off",
				preRemoveBackground: false,
				postRemoveBackground: false,
				trimToContent: false,
				sampleWindow: 1,
			});
			const candidate = analysis.gridCandidates.find(
				(report) =>
					Math.abs(report.grid.cellW - 4) < 1e-4 &&
					Math.abs(report.grid.cellH - 3) < 1e-4 &&
					Math.abs(report.grid.offsetX - (padding % 4)) < 1e-4 &&
					Math.abs(report.grid.offsetY - (padding % 3)) < 1e-4,
			);
			expect(candidate).toBeDefined();
		},
	);

	it("returns deterministically for empty-signal and tiny inputs", () => {
		const image: RawImage = {
			width: 1,
			height: 1,
			data: new Uint8ClampedArray([0, 0, 0, 0]),
		};
		expect(searchPhaseAwareGrid(image, image)).toEqual(
			searchPhaseAwareGrid(image, image),
		);
	});

	it("detects an alpha-only grid when RGB boundaries are absent", () => {
		const image = createSignalGrid(8, 8, 4, "alpha");
		expect(candidateSizes(image)).toContainEqual([8, 8]);
		const estimate = searchPhaseAwareGrid(image, image);
		expect(estimate?.signalScores?.alphaGradient).toBeGreaterThan(0.5);
		expect(estimate?.signalScores?.colorBoundary).toBe(0);
	});

	it("keeps a diagonal-dominant grid in the top three", () => {
		const image = createSignalGrid(8, 8, 4, "diagonal");
		expect(candidateSizes(image)).toContainEqual([8, 8]);
	});

	it("prefers the base period over a strong doubled harmonic", () => {
		const image = createSignalGrid(8, 8, 4, "harmonic");
		expect(candidateSizes(image)[0]).toEqual([8, 8]);
	});

	it("can disable every ensemble signal independently", () => {
		const image = createSignalGrid(8, 8, 4, "alpha");
		const optionKeys = [
			"colorBoundary",
			"luminanceAlphaGradient",
			"autocorrelation",
			"reconstruction",
			"localPhaseStability",
		] as const;
		for (const key of optionKeys) {
			const estimate = searchPhaseAwareGrid(image, image, { [key]: false });
			expect(estimate).not.toBeNull();
			if (!estimate?.signalScores) continue;
			if (key === "luminanceAlphaGradient") {
				expect(estimate.signalScores.luminanceGradient).toBe(0);
				expect(estimate.signalScores.alphaGradient).toBe(0);
			} else if (key === "localPhaseStability") {
				expect(estimate.signalScores.localPhaseStability).toBe(0);
			} else {
				expect(estimate.signalScores[key]).toBe(0);
			}
		}
	});

	it("publishes ensemble subscores in processing diagnostics", () => {
		const image = createSignalGrid(8, 8, 4, "diagonal");
		const { analysis } = processImage(image, {
			autoGridFromTrimmed: true,
			fastAutoGridFromTrimmed: true,
			bgRemovalScope: "off",
			preRemoveBackground: false,
			postRemoveBackground: false,
			trimToContent: false,
			sampleWindow: 1,
		});
		const candidate = analysis.gridCandidates.find(
			(report) => report.outW === 8 && report.outH === 8,
		);
		expect(candidate?.subscores).toMatchObject({
			colorBoundary: expect.any(Number),
			luminanceGradient: expect.any(Number),
			alphaGradient: expect.any(Number),
			autocorrelation: expect.any(Number),
			reconstruction: expect.any(Number),
			localPhaseStability: expect.any(Number),
			methodAgreement: expect.any(Number),
		});
	});

	it("繰り返し回数の足りない周期には高い軸信頼度を与えない", () => {
		// 24x24 の中に 16x16 の無地の板だけがある。軸方向の遷移は左右（上下）の
		// 2 本しかないため、cellW=16 でも予測境界がすべて遷移に一致してしまう。
		const size = 24;
		const data = new Uint8ClampedArray(size * size * 4);
		for (let y = 4; y < 20; y += 1) {
			for (let x = 4; x < 20; x += 1) {
				const index = (y * size + x) * 4;
				data[index] = 40;
				data[index + 1] = 80;
				data[index + 2] = 120;
				data[index + 3] = 255;
			}
		}
		const image: RawImage = { width: size, height: size, data };
		const estimate = searchPhaseAwareGrid(image, image);
		expect(estimate).not.toBeNull();
		if (!estimate) return;
		const minPeriods = GRID_SEARCH_LIMITS.minGridPeriods;
		const threshold = GRID_SEARCH_LIMITS.axisConfidenceThreshold;
		for (const candidate of [estimate, ...(estimate.candidates ?? [])]) {
			if (size / candidate.cellW < minPeriods) {
				expect(candidate.scoreX ?? 0).toBeLessThan(threshold);
			}
			if (size / candidate.cellH < minPeriods) {
				expect(candidate.scoreY ?? 0).toBeLessThan(threshold);
			}
		}
	});

	it("画素数の上限を超える領域では位相考慮探索を行わない", () => {
		const side =
			Math.ceil(Math.sqrt(GRID_SEARCH_LIMITS.maxPhaseAwarePixels)) + 1;
		const image = createScaledGrid(8, 8, side / 8, side / 8);
		expect(image.width * image.height).toBeGreaterThan(
			GRID_SEARCH_LIMITS.maxPhaseAwarePixels,
		);
		expect(searchPhaseAwareGrid(image, image)).toBeNull();
	});
});

describe("resolveGridEstimate の位相の扱い", () => {
	const source = { width: 100, height: 100 };
	const estimate = {
		cellW: 10,
		cellH: 10,
		offsetX: 0,
		offsetY: 0,
		outW: 9,
		outH: 9,
	};

	it("位相を測っていない推定はキャンバス左上を起点にする", () => {
		const grid = resolveGridEstimate(estimate, source, { x: 7, y: 3 }, false);
		expect(grid.offsetX).toBe(0);
		expect(grid.offsetY).toBe(0);
		expect(grid.cropX).toBe(0);
		expect(grid.outW).toBe(10);
		expect(grid.outH).toBe(10);
	});

	it("位相を実測した推定は BBox 起点の端数を投影へ持ち込む", () => {
		// [Intended] 位相 0 の実測でも BBox 起点の端数だけ格子はずれるので、
		// phaseMeasured が立っていれば投影はその端数へ寄せる。
		const grid = resolveGridEstimate(
			{ ...estimate, phaseMeasured: true },
			source,
			{ x: 7, y: 3 },
			false,
		);
		expect(grid.offsetX).toBe(7);
		expect(grid.offsetY).toBe(3);
		expect(grid.cropX).toBe(-3);
		expect(grid.cropY).toBe(-7);
		// 左端の手前から始まるので、被覆は切り上げで 1 セル増える。
		expect(grid.outW).toBe(11);
		expect(grid.outH).toBe(11);
	});

	it("実測した位相は BBox 起点へ足したうえでセル幅で折り返す", () => {
		const grid = resolveGridEstimate(
			{ ...estimate, offsetX: 5, offsetY: 8, phaseMeasured: true },
			source,
			{ x: 7, y: 3 },
			false,
		);
		// 7 + 5 = 12 → セル 10 で折り返して 2。
		expect(grid.offsetX).toBe(2);
		// 3 + 8 = 11 → 1。
		expect(grid.offsetY).toBe(1);
	});

	it("BBox 整列の指定では位相を投影せず BBox をそのまま切り出す", () => {
		const grid = resolveGridEstimate(
			{ ...estimate, phaseMeasured: true },
			source,
			{ x: 7, y: 3 },
			false,
			true,
		);
		expect(grid.offsetX).toBe(0);
		expect(grid.cropX).toBe(7);
		expect(grid.cropY).toBe(3);
		expect(grid.outW).toBe(9);
	});
});
