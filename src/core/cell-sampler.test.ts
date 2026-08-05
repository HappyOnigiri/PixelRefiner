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

/** 単色の正方セルに、位置ごとのアルファだけを与えたテスト画像を作る。 */
const alphaCell = (
	size: number,
	alphaAt: (x: number, y: number) => number,
): RawImage => {
	const data = new Uint8ClampedArray(size * size * 4);
	for (let y = 0; y < size; y += 1) {
		for (let x = 0; x < size; x += 1) {
			const offset = (y * size + x) * 4;
			data[offset] = 240;
			data[offset + 1] = 32;
			data[offset + 2] = 24;
			data[offset + 3] = alphaAt(x, y);
		}
	}
	return { width: size, height: size, data };
};

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

	it("drops a cell whose alpha is only bleed from a neighboring cell", () => {
		// 4x4 セルの右端 1 列だけに、ブラーでにじんだ低いアルファが乗っている。
		const bleeding = alphaCell(4, (x) => (x === 3 ? 85 : 0));
		const restored = sampleImageCells(bleeding, grid(4, 4), options);

		expect(Array.from(restored.data)).toEqual([0, 0, 0, 0]);
	});

	it("keeps a cell whose alpha reaches full opacity on a hard boundary", () => {
		// にじみと同じ被覆率でも、ハードなアルファ境界は最大値が 255 なので残す。
		const hardEdge = alphaCell(4, (x) => (x === 3 ? 255 : 0));
		const restored = sampleImageCells(hardEdge, grid(4, 4), options);

		expect(Array.from(restored.data)).toEqual([240, 32, 24, 64]);
	});

	it("keeps a uniformly semi-transparent cell at its own coverage", () => {
		const flat = alphaCell(4, () => 96);
		const restored = sampleImageCells(flat, grid(4, 4), options);

		expect(Array.from(restored.data)).toEqual([240, 32, 24, 96]);
	});

	it("picks the representative color from the cell core, not the blended rim", () => {
		// セル境界の 12 画素は隣接セルとの混色。数では多数派だが代表色にしてはいけない。
		const data = new Uint8ClampedArray(4 * 4 * 4);
		for (let y = 0; y < 4; y += 1) {
			for (let x = 0; x < 4; x += 1) {
				const offset = (y * 4 + x) * 4;
				const core = x >= 1 && x <= 2 && y >= 1 && y <= 2;
				data[offset] = core ? 240 : 120;
				data[offset + 1] = core ? 32 : 120;
				data[offset + 2] = core ? 24 : 120;
				data[offset + 3] = 255;
			}
		}
		const restored = sampleImageCells(
			{ width: 4, height: 4, data },
			grid(4, 4),
			options,
		);

		expect(Array.from(restored.data)).toEqual([240, 32, 24, 255]);
	});

	it("blends the core average into the medoid when they are nearly identical", () => {
		// コア4画素中3画素が (200,40,30)、1画素が (192,40,30)。差はごく僅かなので
		// ブラーの量子化ノイズとみなし、medoid ではなく平均色 (198,40,30) を採用する。
		const data = new Uint8ClampedArray(4 * 4 * 4);
		for (let y = 0; y < 4; y += 1) {
			for (let x = 0; x < 4; x += 1) {
				const offset = (y * 4 + x) * 4;
				const core = x >= 1 && x <= 2 && y >= 1 && y <= 2;
				const minority = core && x === 1 && y === 1;
				data[offset] = core ? (minority ? 192 : 200) : 0;
				data[offset + 1] = 40;
				data[offset + 2] = 30;
				data[offset + 3] = 255;
			}
		}
		const restored = sampleImageCells(
			{ width: 4, height: 4, data },
			grid(4, 4),
			options,
		);

		expect(Array.from(restored.data)).toEqual([198, 40, 30, 255]);
	});

	it("keeps the exact medoid when the core mixes two far-apart colors", () => {
		// コア4画素中3画素が (255,0,0)、1画素が (0,255,0)。平均は medoid から遠く、
		// ディザ柄など離散色が混在するケースなので合成せず実在色のまま残す。
		const data = new Uint8ClampedArray(4 * 4 * 4);
		for (let y = 0; y < 4; y += 1) {
			for (let x = 0; x < 4; x += 1) {
				const offset = (y * 4 + x) * 4;
				const core = x >= 1 && x <= 2 && y >= 1 && y <= 2;
				const minority = core && x === 1 && y === 1;
				data[offset] = core && !minority ? 255 : 0;
				data[offset + 1] = minority ? 255 : 0;
				data[offset + 2] = 0;
				data[offset + 3] = 255;
			}
		}
		const restored = sampleImageCells(
			{ width: 4, height: 4, data },
			grid(4, 4),
			options,
		);

		expect(Array.from(restored.data)).toEqual([255, 0, 0, 255]);
	});

	it("falls back to the whole cell when the core has no opaque sample", () => {
		// コアが透明なセルでは絞り込みを解除し、従来どおり全域から代表色を選ぶ。
		const data = new Uint8ClampedArray(4 * 4 * 4);
		for (let y = 0; y < 4; y += 1) {
			for (let x = 0; x < 4; x += 1) {
				const offset = (y * 4 + x) * 4;
				const core = x >= 1 && x <= 2 && y >= 1 && y <= 2;
				data[offset] = core ? 0 : 240;
				data[offset + 1] = core ? 0 : 32;
				data[offset + 2] = core ? 0 : 24;
				data[offset + 3] = core ? 0 : 255;
			}
		}
		const restored = sampleImageCells(
			{ width: 4, height: 4, data },
			grid(4, 4),
			options,
		);

		expect(Array.from(restored.data)).toEqual([240, 32, 24, 191]);
	});

	it("keeps a noisy semi-transparent cell that never drops to empty", () => {
		// 最小値が最大値の半分を超えるため、ランプではなく一様な半透明として扱う。
		const noisy = alphaCell(4, (x, y) => 88 + ((x + y) % 3) * 8);
		const restored = sampleImageCells(noisy, grid(4, 4), options);

		expect(Array.from(restored.data)).toEqual([240, 32, 24, 96]);
	});

	it("skips the bleed check when a cell is only one pixel tall", () => {
		// セルが 1 画素しかない軸では、アルファ勾配が元画像の表現である可能性が高い。
		const bleeding = alphaCell(2, (x) => (x === 1 ? 85 : 0));
		const restored = sampleImageCells(
			bleeding,
			{ ...grid(2, 1), outH: 2 },
			options,
		);

		expect(Array.from(restored.data.slice(0, 4))).toEqual([240, 32, 24, 43]);
	});

	it("drops legacy-median bleed while keeping the grid-search sampling intact", () => {
		const bleeding = alphaCell(4, (x) => (x === 3 ? 85 : 0));
		const legacyOptions = {
			mode: "legacy-median",
			sampleWindow: 3,
			maxSamplesPerCell: 64,
			alphaThreshold: 16,
			preserveThinFeatures: true,
		} as const;

		expect(
			Array.from(downsample(bleeding, grid(4, 4), legacyOptions).data),
		).toEqual([0, 0, 0, 0]);
		// [Intended] 数値指定はグリッド探索の再構成スコア用。検出結果を動かさないため旧挙動のまま。
		expect(Array.from(downsample(bleeding, grid(4, 4), 3).data)).toEqual([
			240, 32, 24, 85,
		]);
		expect(
			Array.from(
				downsample(
					alphaCell(4, (x) => (x === 3 ? 255 : 0)),
					grid(4, 4),
					legacyOptions,
				).data,
			),
		).toEqual([240, 32, 24, 255]);
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
