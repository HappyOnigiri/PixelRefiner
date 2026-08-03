import { describe, expect, it } from "vitest";
import type { ProcessingAnalysis } from "../shared/types";
import {
	candidateProcessOptions,
	createCandidatePreview,
	selectCandidatePlans,
} from "./candidate-previews";
import { resizeRawImageNearest } from "./image-operations";
import { processImage } from "./processor";
import { readPngAsRawImage } from "./processor-test-helpers";

const analysis = (classification: ProcessingAnalysis["classification"]) =>
	({
		classification,
		route: "preserve",
		confidence: 0.1,
		warnings: ["LOW_GRID_CONFIDENCE"],
		gridCandidates: [
			{
				grid: { cellW: 4, cellH: 4, offsetX: 0, offsetY: 0, score: 1 },
				outW: 16,
				outH: 16,
				cropX: 0,
				cropY: 0,
				cropW: 64,
				cropH: 64,
				method: "grid",
				totalScore: 0.9,
				confidence: 0.2,
			},
			{
				grid: { cellW: 2, cellH: 2, offsetX: 0, offsetY: 0, score: 2 },
				outW: 32,
				outH: 32,
				cropX: 0,
				cropY: 0,
				cropW: 64,
				cropH: 64,
				method: "grid",
				totalScore: 0.8,
				confidence: 0.15,
			},
			{
				grid: { cellW: 8, cellH: 8, offsetX: 0, offsetY: 0, score: 3 },
				outW: 8,
				outH: 8,
				cropX: 0,
				cropY: 0,
				cropW: 64,
				cropH: 64,
				method: "grid",
				totalScore: 0.7,
				confidence: 0.1,
			},
		],
	}) satisfies ProcessingAnalysis;

describe("candidate previews", () => {
	it("推奨・細かめ・粗め・原寸維持を決定論的に選ぶ", () => {
		const plans = selectCandidatePlans(analysis("scaled-pixel"));
		expect(plans.map((plan) => plan.kind)).toEqual([
			"recommended",
			"finer",
			"coarser",
			"preserve",
		]);
		expect(plans[0].recommended).toBe(true);
	});

	it("通常画像か不明な入力では空き枠へConvert候補を加える", () => {
		const value = analysis("uncertain");
		value.gridCandidates = value.gridCandidates.slice(0, 1);
		expect(selectCandidatePlans(value).map((plan) => plan.kind)).toEqual([
			"recommended",
			"preserve",
			"convert",
		]);
	});

	it("推奨と見分けが付かない近接候補は細かめ・粗めに採らない", () => {
		const value = analysis("scaled-pixel");
		// 推奨(100x100, cell 4)に対し面積差1%・セル差0.1pxの候補だけを並べる。
		value.gridCandidates = [
			{
				...value.gridCandidates[0],
				grid: { cellW: 4, cellH: 4, offsetX: 0, offsetY: 0, score: 1 },
				outW: 100,
				outH: 100,
			},
			{
				...value.gridCandidates[0],
				grid: { cellW: 4.1, cellH: 4.1, offsetX: 0, offsetY: 0, score: 1 },
				outW: 101,
				outH: 100,
			},
			{
				...value.gridCandidates[0],
				grid: { cellW: 3.9, cellH: 3.9, offsetX: 0, offsetY: 0, score: 1 },
				outW: 99,
				outH: 100,
			},
		];
		expect(selectCandidatePlans(value).map((plan) => plan.kind)).toEqual([
			"recommended",
			"preserve",
		]);
	});

	it("分類が未算出でも呼び出し側の判定でConvert候補を加えられる", () => {
		const value = analysis(undefined);
		value.gridCandidates = value.gridCandidates.slice(0, 1);
		expect(selectCandidatePlans(value).map((plan) => plan.kind)).toEqual([
			"recommended",
			"preserve",
		]);
		expect(
			selectCandidatePlans(value, "continuous").map((plan) => plan.kind),
		).toEqual(["recommended", "preserve", "convert"]);
	});

	it("候補適用時に元のヒント設定を引き継がない", () => {
		const options = candidateProcessOptions(
			{ hintPixelsW: 10, hintPixelsH: 10 },
			selectCandidatePlans(analysis("scaled-pixel"))[0],
		);
		expect(options).toMatchObject({
			processingMode: "refine",
			forcePixelsW: 16,
			forcePixelsH: 16,
		});
		expect(options.hintPixelsW).toBeUndefined();
	});

	it("大画像の候補は先に軽量なプレビューへ縮小する", () => {
		const selection = selectCandidatePlans(analysis("scaled-pixel"))[0];
		const preview = createCandidatePreview(
			selection,
			{
				width: 400,
				height: 200,
				data: new Uint8ClampedArray(400 * 200 * 4),
			},
			1,
		);
		expect(preview.preview.width).toBe(192);
		expect(preview.preview.height).toBe(96);
		expect(preview.resultWidth).toBe(400);
	});

	it("PRF-400のUI既定値fixtureで候補モーダル条件を満たす", async () => {
		const image = await readPngAsRawImage(
			"test/fixtures/quality_prf400_ui_low_confidence.png",
		);
		const options = {
			// [Intended] UI既定値の3%をピクセル数へ変換した値だけを明示する。
			floatingMaxPixels: Math.ceil(image.width * image.height * 0.03),
		};
		const processed = processImage(image, options);
		const first = selectCandidatePlans(processed.analysis);
		const second = selectCandidatePlans(processed.analysis);
		expect(processed.analysis.warnings).toContain("LOW_GRID_CONFIDENCE");
		expect(processed.analysis.warnings).not.toContain(
			"BACKGROUND_REMOVAL_SKIPPED",
		);
		expect(first.some((plan) => plan.kind === "preserve")).toBe(true);
		expect(second).toEqual(first);
		const rendered = first.map((selection) => {
			const candidate = processImage(
				image,
				candidateProcessOptions(options, selection),
			);
			return createCandidatePreview(
				selection,
				candidate.result,
				candidate.extractedPalette.length,
			);
		});
		expect(rendered).toHaveLength(first.length);
		for (const candidate of rendered) {
			let visiblePixels = 0;
			for (
				let offset = 3;
				offset < candidate.preview.data.length;
				offset += 4
			) {
				if (candidate.preview.data[offset] > 0) visiblePixels += 1;
			}
			expect(visiblePixels).toBeGreaterThan(0);
			expect(candidate.colorCount).toBeGreaterThan(0);
		}
		const refined = rendered.filter(
			(candidate) => candidate.processingMode === "refine",
		);
		const visualResults = new Set(
			refined.map((candidate) => {
				const normalized = resizeRawImageNearest(
					candidate.preview,
					0,
					0,
					candidate.preview.width,
					candidate.preview.height,
					96,
					96,
				);
				return Buffer.from(normalized.data).toString("base64");
			}),
		);
		expect(visualResults.size).toBe(refined.length);
	});
});
