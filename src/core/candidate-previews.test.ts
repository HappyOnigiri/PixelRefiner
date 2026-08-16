import { describe, expect, it } from "vitest";
import type {
	GridCandidateReport,
	ProcessingAnalysis,
	RawImage,
} from "../shared/types";
import {
	candidateProcessOptions,
	createCandidateAcceptor,
	createCandidatePreview,
	selectCandidatePlans,
} from "./candidate-previews";
import { resizeRawImageNearest } from "./image-operations";
import { processImage } from "./processor";
import {
	expectSameImageExcept,
	RESIZE_WITH_TRIMMING_AUTO_EDGE_PIXELS,
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
		autoResultCandidateIndex: 0,
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

/** 実出力の寸法だけを見る判定へ渡す、中身のない画像。 */
const rawImage = (width: number, height: number): RawImage => ({
	width,
	height,
	data: new Uint8ClampedArray(width * height * 4),
});

/** rankGridCandidates が必ず加える原寸維持の候補。 */
const preserveReport: GridCandidateReport = {
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
};

describe("candidate previews", () => {
	it("Auto結果・セル倍率4段階・原寸維持の順で候補を決定論的に選ぶ", () => {
		const plans = selectCandidatePlans(analysis("scaled-pixel"));

		expect(plans.map((plan) => plan.kind)).toEqual([
			"auto-result",
			"cell-scale",
			"cell-scale",
			"cell-scale",
			"cell-scale",
			"preserve",
		]);
		expect(plans.map((plan) => plan.cellScale)).toEqual([
			undefined,
			"quarter",
			"half",
			"double",
			"quadruple",
			undefined,
		]);
		expect(plans[0]).toMatchObject({
			recommended: true,
			processingMode: "auto",
			outW: 16,
			outH: 16,
		});
		expect(selectCandidatePlans(analysis("scaled-pixel"))).toEqual(plans);
	});

	it("通常画像か不明な入力では空き枠へConvert候補を加える", () => {
		const value = analysis("uncertain");
		expect(selectCandidatePlans(value).map((plan) => plan.kind)).toEqual([
			"auto-result",
			"cell-scale",
			"cell-scale",
			"cell-scale",
			"cell-scale",
			"preserve",
			"convert",
		]);
	});

	it("原寸維持と見分けが付かないセル倍率候補は実出力で落とす", () => {
		const value = analysis("scaled-pixel");
		// セル 4px の 1/4 は 1px となり、原寸維持（64x64）と同じ出力になる。
		value.gridCandidates = [...value.gridCandidates, preserveReport];
		const accept = createCandidateAcceptor(value);
		const quarter = selectCandidatePlans(value).find(
			(plan) => plan.cellScale === "quarter",
		);
		expect(quarter).toBeDefined();

		// biome-ignore lint/style/noNonNullAssertion: 直前に存在を検証している
		expect(accept(quarter!, rawImage(64, 64))).toBe(false);
		// biome-ignore lint/style/noNonNullAssertion: 直前に存在を検証している
		expect(accept(quarter!, rawImage(32, 32))).toBe(true);
	});

	it("実出力が1ドットしかない候補と同寸法の候補は採らない", () => {
		const value = analysis("scaled-pixel");
		const accept = createCandidateAcceptor(value);
		const plans = selectCandidatePlans(value).filter(
			(plan) => plan.kind === "cell-scale",
		);
		expect(plans.length).toBeGreaterThanOrEqual(3);

		// 見積もりでは 2x2 でも、トリム後に 1x1 まで潰れる候補は並べない。
		expect(accept(plans[0], rawImage(1, 1))).toBe(false);
		expect(accept(plans[1], rawImage(8, 8))).toBe(true);
		// 隣の段階と同じ寸法へ落ち着いた候補は 2 枚目を落とす。
		expect(accept(plans[2], rawImage(8, 8))).toBe(false);
	});

	it("セル倍率以外の候補は実出力の重複や下限では落とさない", () => {
		const value = analysis("uncertain");
		const accept = createCandidateAcceptor(value);
		const plans = selectCandidatePlans(value);
		const cellScale = plans.find((plan) => plan.kind === "cell-scale");
		const preserve = plans.find((plan) => plan.kind === "preserve");
		const convert = plans.find((plan) => plan.kind === "convert");
		expect(cellScale && preserve && convert).toBeTruthy();

		// biome-ignore lint/style/noNonNullAssertion: 直前に存在を検証している
		expect(accept(cellScale!, rawImage(8, 8))).toBe(true);
		// 原寸維持と Convert は「ドットの大きさ違い」ではないので、同寸法でも並べる。
		// biome-ignore lint/style/noNonNullAssertion: 直前に存在を検証している
		expect(accept(preserve!, rawImage(8, 8))).toBe(true);
		// biome-ignore lint/style/noNonNullAssertion: 直前に存在を検証している
		expect(accept(convert!, rawImage(8, 8))).toBe(true);
	});

	it("セル寸法が1pxを下回る倍率は候補にしない", () => {
		const value = analysis("scaled-pixel");
		value.gridCandidates = [
			{
				...value.gridCandidates[0],
				grid: { ...value.gridCandidates[0].grid, cellW: 2, cellH: 2 },
			},
		];

		expect(selectCandidatePlans(value).map((plan) => plan.cellScale)).toEqual([
			undefined,
			"half",
			"double",
			"quadruple",
			undefined,
		]);
	});

	it("分類が未算出でも呼び出し側の判定でConvert候補を加えられる", () => {
		const value = analysis(undefined);
		expect(
			selectCandidatePlans(value).some((plan) => plan.kind === "convert"),
		).toBe(false);
		expect(
			selectCandidatePlans(value, "continuous").some(
				(plan) => plan.kind === "convert",
			),
		).toBe(true);
	});

	it("セル倍率の候補はforcePixelsを設定せずcellScaleだけを渡す", () => {
		const plans = selectCandidatePlans(analysis("scaled-pixel"));
		const cellScalePlan = plans.find((plan) => plan.kind === "cell-scale");
		expect(cellScalePlan).toBeDefined();

		const options = candidateProcessOptions(
			{ hintPixelsW: 10, hintPixelsH: 10, forcePixelsW: 8, forcePixelsH: 8 },
			// biome-ignore lint/style/noNonNullAssertion: 直前に存在を検証している
			cellScalePlan!,
		);

		expect(options).toMatchObject({
			processingMode: "refine",
			cellScale: "quarter",
		});
		// [Intended] force はユーザーが詳細設定で明示したときだけ通る経路で、候補が
		// 勝手に使うと内容 BBox の軸独立分割で縦横比が壊れる。
		expect(options.forcePixelsW).toBeUndefined();
		expect(options.forcePixelsH).toBeUndefined();
		// 検出の開始点は候補でも同じにする。変えると提示した絵と選択後の結果がずれる。
		expect(options.hintPixelsW).toBe(10);
		expect(options.hintPixelsH).toBe(10);
	});

	it("現在選んでいるドットの大きさは候補に出さない", () => {
		const plans = selectCandidatePlans(
			analysis("scaled-pixel"),
			"scaled-pixel",
			"double",
		);

		expect(plans.map((plan) => plan.cellScale)).toEqual([
			undefined,
			"quarter",
			"half",
			"same",
			"quadruple",
			undefined,
		]);
	});

	it("原寸維持とConvertの候補はセル倍率を持ち込まない", () => {
		const plans = selectCandidatePlans(analysis("uncertain"));
		for (const kind of ["preserve", "convert"] as const) {
			const plan = plans.find((entry) => entry.kind === kind);
			expect(plan).toBeDefined();
			// biome-ignore lint/style/noNonNullAssertion: 直前に存在を検証している
			const options = candidateProcessOptions({ cellScale: "double" }, plan!);
			expect(options.cellScale).toBeUndefined();
		}
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

	it("PRF-400のUI既定値fixtureで候補提示の条件を満たす", async () => {
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
		// 実際に並ぶ候補と同じ手順で作る。採否は実出力を見る判定に任せる。
		const accept = createCandidateAcceptor(processed.analysis);
		const rendered = first.flatMap((selection) => {
			const candidate = processImage(
				image,
				candidateProcessOptions(options, selection),
			);
			if (!accept(selection, candidate.result)) return [];
			return [
				createCandidatePreview(
					selection,
					candidate.result,
					candidate.extractedPalette.length,
				),
			];
		});
		expect(rendered.length).toBeGreaterThan(0);
		expect(rendered.length).toBeLessThanOrEqual(first.length);
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
		// セル倍率の候補は入力の縦横比を保つ。軸ごとに分割する force 経路と違い、
		// 両軸へ同じ倍率が掛かるため、Auto 結果との縦横比のずれは丸め分に収まる。
		const autoRendered = rendered.find(
			(candidate) => candidate.kind === "auto-result",
		);
		expect(autoRendered).toBeDefined();
		const autoAspect =
			(autoRendered?.resultWidth ?? 1) / (autoRendered?.resultHeight ?? 1);
		for (const candidate of rendered) {
			if (candidate.kind !== "cell-scale") continue;
			const aspect = candidate.resultWidth / candidate.resultHeight;
			expect(Math.abs(aspect - autoAspect)).toBeLessThan(autoAspect * 0.25);
		}
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
		expect(plans.filter((plan) => plan.kind === "auto-result")).toHaveLength(1);
		expect(plans.length).toBeLessThanOrEqual(7);
	});

	it("Auto実結果の再処理では元のヒント設定を引き継ぐ", () => {
		const value = analysis("scaled-pixel");
		value.autoResultCandidateIndex = 0;
		const selection = selectCandidatePlans(value)[0];
		expect(selection.processingMode).toBe("auto");
		expect(
			candidateProcessOptions(
				{
					hintPixelsW: 10,
					hintPixelsH: 12,
					convertPixelsW: 24,
					convertPixelsH: 20,
				},
				selection,
			),
		).toMatchObject({
			processingMode: "auto",
			hintPixelsW: 10,
			hintPixelsH: 12,
			convertPixelsW: 24,
			convertPixelsH: 20,
			forcePixelsW: undefined,
			forcePixelsH: undefined,
		});
	});

	it("Autoが原寸維持へ退避したときは検出格子を基準に全段階を出す", () => {
		const value = analysis("scaled-pixel");
		value.gridCandidates = [...value.gridCandidates, preserveReport];
		value.autoResultCandidateIndex = 3;

		const plans = selectCandidatePlans(value);

		expect(plans[0]).toMatchObject({
			kind: "auto-result",
			recommended: true,
			processingMode: "auto",
		});
		// [Intended] 退避の理由は信頼度の低さで、検出セルが 1px という意味ではない。
		// 検出格子で復元した結果（same）も含めて選べるようにする。
		expect(plans.map((plan) => plan.cellScale)).toEqual([
			undefined,
			"quarter",
			"half",
			"same",
			"double",
			"quadruple",
		]);
		// 原寸維持と同じ絵になる段階は、実出力を見る判定の側で落とす。
		const accept = createCandidateAcceptor(value);
		const quarter = plans.find((plan) => plan.cellScale === "quarter");
		// biome-ignore lint/style/noNonNullAssertion: 直前の期待値で存在を検証している
		expect(accept(quarter!, rawImage(64, 64))).toBe(false);
		// 原寸維持カードは Auto 結果カードが兼ねる。
		expect(plans.some((plan) => plan.kind === "preserve")).toBe(false);
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
		// Auto は縁の背景色の汚染を落とすため、期待値画像にわずかな緑が残る 2 画素だけ
		// 色が変わる。変わる画素を固定し、それ以外は完全一致を要求する。
		expectSameImageExcept(
			processed.result,
			expected,
			RESIZE_WITH_TRIMMING_AUTO_EDGE_PIXELS,
		);
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
		expect(plans.filter((plan) => plan.kind === "auto-result")).toHaveLength(1);
		expect(plans.length).toBeLessThanOrEqual(7);

		const reselected = processImage(
			image,
			candidateProcessOptions({ debug: false }, plans[0]),
		);
		expect(reselected.result.width).toBe(46);
		expect(reselected.result.height).toBe(13);
		expect(reselected.result.data).toEqual(processed.result.data);
	});
});
