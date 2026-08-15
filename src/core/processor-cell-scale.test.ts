import { describe, expect, it } from "vitest";
import type { RawImage } from "../shared/types";
import { processImage } from "./processor";
import type { DetectedGridHandoff, ProcessOptions } from "./processor-options";
import { readPngAsRawImage } from "./processor-test-helpers";

const loadFixture = (): Promise<RawImage> =>
	readPngAsRawImage("test/fixtures/resize_with_trimming.png");

const aspect = (image: RawImage): number => image.width / image.height;

describe("cellScale", () => {
	it("既定の same は未指定と 1 ピクセルも変わらない", async () => {
		const image = await loadFixture();

		const base = processImage(image, { debug: false });
		const same = processImage(image, { debug: false, cellScale: "same" });

		expect(same.result.width).toBe(base.result.width);
		expect(same.result.height).toBe(base.result.height);
		expect(same.result.data).toEqual(base.result.data);
	});

	it("倍率を上げると出力が縮み、縦横比は保たれる", async () => {
		const image = await loadFixture();

		const same = processImage(image, { debug: false });
		const double = processImage(image, { debug: false, cellScale: "double" });

		// same は 46x13。両軸を 2 倍のセルで割るので、切り捨て込みで 23x6 になる。
		expect(same.result.width).toBe(46);
		expect(same.result.height).toBe(13);
		expect(double.result.width).toBe(23);
		expect(double.result.height).toBe(6);
		// [Intended] 両軸へ同じ倍率が掛かるので、縦横比は丸め分しかずれない。
		// forcePixelsW/H の軸独立分割と決定的に違うのがこの性質。
		expect(Math.abs(aspect(double.result) - aspect(same.result))).toBeLessThan(
			aspect(same.result) * 0.25,
		);
	});

	it("倍率を下げると出力が広がり、縦横比は保たれる", async () => {
		const image = await loadFixture();

		const same = processImage(image, { debug: false });
		const half = processImage(image, { debug: false, cellScale: "half" });

		expect(half.result.width).toBe(92);
		expect(half.result.height).toBe(26);
		expect(Math.abs(aspect(half.result) - aspect(same.result))).toBeLessThan(
			aspect(same.result) * 0.25,
		);
	});

	it("セル寸法は 1px 未満へ縮めず、元画像を超えて拡大しない", async () => {
		const image = await loadFixture();

		const quarter = processImage(image, { debug: false, cellScale: "quarter" });

		expect(quarter.result.width).toBeLessThanOrEqual(image.width);
		expect(quarter.result.height).toBeLessThanOrEqual(image.height);
		expect(quarter.grid.cellW).toBeGreaterThanOrEqual(1);
		expect(quarter.grid.cellH).toBeGreaterThanOrEqual(1);
	});

	it("縦横でセル寸法が違う格子でも縦横比を保つ", async () => {
		// [Intended] 片方の軸だけ 1px の下限に当たると倍率が軸ごとに食い違う。
		// 下限は倍率そのものへ掛けるので、下限に当たっても縦横比は動かない。
		for (const fixture of [
			"test/fixtures/quality_anisotropic.png",
			"test/fixtures/quality_nearest_1_5x.png",
		]) {
			const image = await readPngAsRawImage(fixture);
			const same = processImage(image, {
				debug: false,
				processingMode: "refine",
			});
			for (const cellScale of ["quarter", "half", "double"] as const) {
				const scaled = processImage(image, {
					debug: false,
					processingMode: "refine",
					cellScale,
				});
				expect(
					Math.abs(aspect(scaled.result) - aspect(same.result)),
				).toBeLessThan(aspect(same.result) * 0.2);
			}
		}
	});

	it("原寸維持と Convert の経路では無視する", async () => {
		const image = await loadFixture();

		for (const processingMode of ["preserve", "convert"] as const) {
			const base = processImage(image, { debug: false, processingMode });
			const scaled = processImage(image, {
				debug: false,
				processingMode,
				cellScale: "double",
			});
			expect(scaled.result.width).toBe(base.result.width);
			expect(scaled.result.height).toBe(base.result.height);
			expect(scaled.result.data).toEqual(base.result.data);
		}
	});

	it("ピクセル数の明示指定（force）には影響しない", async () => {
		const image = await loadFixture();
		const forced: ProcessOptions = {
			debug: false,
			forcePixelsW: 24,
			forcePixelsH: 12,
		};

		const base = processImage(image, forced);
		const scaled = processImage(image, { ...forced, cellScale: "double" });

		expect(scaled.result.width).toBe(24);
		expect(scaled.result.height).toBe(12);
		expect(scaled.result.data).toEqual(base.result.data);
	});
});

describe("detectedGrid", () => {
	// [Intended] 検出のヒントは検出結果を変えるため、渡した格子と検出パラメータが
	// 食い違うと候補のプレビューと選択後の結果がずれる。ヒントの有無どちらでも一致させる。
	const hintCases: ProcessOptions[] = [
		{ debug: false },
		{ debug: false, hintPixelsW: 24, hintPixelsH: 24 },
	];

	it.each(hintCases)(
		"検出済みの格子を渡しても検出し直した場合と出力が一致する (%o)",
		async (baseOptions) => {
			const image = await loadFixture();
			let handoff: DetectedGridHandoff | undefined;
			const base = processImage(image, {
				...baseOptions,
				onDetectedGrid: (detected) => {
					handoff = detected;
				},
			});
			expect(handoff).toBeDefined();

			for (const cellScale of ["same", "double"] as const) {
				const detected = processImage(image, {
					...baseOptions,
					cellScale,
					detectedGrid: handoff,
				});
				const fresh = processImage(image, { ...baseOptions, cellScale });
				expect(detected.result.width).toBe(fresh.result.width);
				expect(detected.result.height).toBe(fresh.result.height);
				expect(detected.result.data).toEqual(fresh.result.data);
				if (cellScale === "same") {
					expect(detected.result.data).toEqual(base.result.data);
				}
			}
		},
	);
});
