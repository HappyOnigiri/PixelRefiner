import { describe, expect, it } from "vitest";
import type { ProcessingAnalysis } from "../shared/types";
import {
	candidateProcessOptions,
	createCandidatePreview,
	selectCandidatePlans,
} from "./candidate-previews";
import { resizeRawImageNearest } from "./image-operations";
import { processImage } from "./processor";
import {
	expectSimilarImage,
	readPngAsRawImage,
} from "./processor-test-helpers";

const analysis = (
	classification: ProcessingAnalysis["classification"],
): ProcessingAnalysis =>
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

	it("低信頼時も先頭でないAuto実結果を推奨候補として一度だけ含める", () => {
		const value = analysis("scaled-pixel");
		value.autoResultCandidateIndex = 1;

		const plans = selectCandidatePlans(value);

		expect(plans[0]).toMatchObject({
			kind: "auto-result",
			recommended: true,
			processingMode: "auto",
			outW: 32,
			outH: 32,
		});
		expect(
			plans.filter((plan) => plan.outW === 32 && plan.outH === 32),
		).toHaveLength(1);
		expect(plans.some((plan) => plan.kind === "recommended")).toBe(false);
		expect(plans.length).toBeLessThanOrEqual(4);
		expect(plans.map((plan) => plan.kind)).toEqual([
			"auto-result",
			"coarser",
			"preserve",
		]);
		expect(plans[1]).toMatchObject({ outW: 16, outH: 16 });
	});

	it("Auto実結果の再処理では元のヒント設定を引き継ぐ", () => {
		const value = analysis("scaled-pixel");
		value.autoResultCandidateIndex = 0;
		const selection = selectCandidatePlans(value)[0];
		expect(selection.processingMode).toBe("auto");
		expect(
			candidateProcessOptions({ hintPixelsW: 10, hintPixelsH: 12 }, selection),
		).toMatchObject({
			processingMode: "auto",
			hintPixelsW: 10,
			hintPixelsH: 12,
			forcePixelsW: undefined,
			forcePixelsH: undefined,
		});
	});

	it("Auto実結果の実出力サイズを細かめ・粗めの基準にする", () => {
		const value = analysis("scaled-pixel");
		// 8x8 の候補を採用したが、検出後のトリミングで実出力は 3x3 まで縮んだ状況。
		value.autoResultCandidateIndex = 2;
		value.autoResultOutW = 3;
		value.autoResultOutH = 3;

		const plans = selectCandidatePlans(value);

		expect(plans.map((plan) => plan.kind)).toEqual([
			"auto-result",
			"finer",
			"preserve",
		]);
		// 実面積 9 を基準にすると 8x8 自身が細かめの先頭に来るが、Auto実結果カードと
		// 同じサイズなので採らず、次の候補へ進む。
		expect(plans[1]).toMatchObject({ outW: 16, outH: 16 });
	});

	it("Autoが原寸維持を採用したときは原寸維持カードをAuto実結果として一度だけ出す", () => {
		const value = analysis("scaled-pixel");
		value.gridCandidates = [
			...value.gridCandidates,
			{
				grid: { cellW: 1, cellH: 1, offsetX: 0, offsetY: 0, score: 0 },
				outW: 64,
				outH: 64,
				cropX: 0,
				cropY: 0,
				cropW: 64,
				cropH: 64,
				method: "preserve",
				totalScore: 0.1,
				confidence: 0.05,
			},
		];
		value.autoResultCandidateIndex = 3;

		const plans = selectCandidatePlans(value);

		expect(plans.map((plan) => plan.kind)).toEqual([
			"auto-result",
			"recommended",
			"finer",
			"coarser",
		]);
		expect(plans[0]).toMatchObject({
			recommended: true,
			processingMode: "auto",
		});
		// 検出グリッド候補の3枠（推奨・細かめ・粗め）が維持される。
		expect(plans[1]).toMatchObject({ outW: 16, outH: 16, recommended: false });
		expect(plans[2]).toMatchObject({ outW: 32, outH: 32 });
		expect(plans[3]).toMatchObject({ outW: 8, outH: 8 });
	});

	it("resize_with_trimmingのAuto結果を候補計画へ含める", async () => {
		const image = await readPngAsRawImage(
			"test/fixtures/resize_with_trimming.png",
		);
		const expected = await readPngAsRawImage(
			"test/fixtures/resize_with_trimming-expect.png",
		);
		const processed = processImage(image, { debug: false });
		expect(processed.result.width).toBe(46);
		expect(processed.result.height).toBe(13);
		// Auto は縁の背景色の汚染を落とすため、期待値画像にわずかな緑が残る 2 画素で
		// 数階調ずれる。シルエットの一致は厳密に確認する。
		expectSimilarImage(processed.result, expected, 16);
		// 採用した格子が候補の最上位として確定する。以前はサブスコアの減点で
		// 信頼度がしきい値をわずかに下回り、正しい出力なのに未確定になっていた。
		expect(processed.analysis.selectedCandidateIndex).toBe(0);
		const autoResultIndex = processed.analysis.autoResultCandidateIndex;
		expect(autoResultIndex).toBeDefined();
		const autoResultCandidate =
			processed.analysis.gridCandidates[autoResultIndex ?? -1];
		expect(autoResultCandidate).toMatchObject({ outW: 46, outH: 13 });

		const plans = selectCandidatePlans(processed.analysis);
		expect(plans[0]).toMatchObject({
			kind: "auto-result",
			recommended: true,
			processingMode: "auto",
			outW: 46,
			outH: 13,
		});
		expect(
			plans.filter((plan) => plan.outW === 46 && plan.outH === 13),
		).toHaveLength(1);
		expect(plans.length).toBeLessThanOrEqual(4);

		const reselected = processImage(
			image,
			candidateProcessOptions({ debug: false }, plans[0]),
		);
		expect(reselected.result.width).toBe(46);
		expect(reselected.result.height).toBe(13);
		expect(reselected.result.data).toEqual(processed.result.data);
	});
});
