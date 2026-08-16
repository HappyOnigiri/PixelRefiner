import { describe, expect, it } from "vitest";
import { PROCESS_DEFAULTS } from "../shared/config";
import type {
	CandidateSelection,
	ProcessingAnalysis,
	ProcessResult,
	RawImage,
} from "../shared/types";
import { createProcessingService } from "./processing-service";
import type { ProcessOptions } from "./processor";
import type { DetectedGridHandoff } from "./processor-options";

const rawImage = (width: number, height: number): RawImage => ({
	width,
	height,
	data: new Uint8ClampedArray(width * height * 4),
});

const handoff = {
	grid: { cellW: 4, cellH: 4, offsetX: 0, offsetY: 0, score: 1 },
	gridMethod: "detect-grid",
	downsampleOptions: {},
	allowSmallTrimmedGrid: false,
	gridAlignedToContent: false,
	rankedCandidates: [],
} as unknown as DetectedGridHandoff;

/** ドットの大きさごとに別の寸法へ落ちる、中身のない処理結果。 */
const outputSize: Record<string, number> = {
	quarter: 40,
	half: 20,
	same: 10,
	double: 5,
	quadruple: 3,
};

const analysis: ProcessingAnalysis = {
	classification: "scaled-pixel",
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
	],
};

const options: ProcessOptions = {
	...PROCESS_DEFAULTS,
	processingMode: "auto",
} as unknown as ProcessOptions;

const image = rawImage(64, 64);
const CACHE_KEY = "image-1:{}";

/** 呼ばれた処理オプションを記録し、寸法だけが違う結果を返す処理関数。 */
const createService = () => {
	const calls: ProcessOptions[] = [];
	const service = createProcessingService((_img, opts) => {
		calls.push(opts);
		opts.onDetectedGrid?.(handoff);
		const size = outputSize[opts.cellScale ?? "same"] ?? 10;
		return {
			result: rawImage(size, size),
			grid: { cellW: 1, cellH: 1, offsetX: 0, offsetY: 0, score: 1 },
			extractedPalette: [],
			analysis,
			compareBefore: rawImage(64, 64),
			compareBeforeSanitized: rawImage(size, size),
		} satisfies ProcessResult;
	});
	return { service, calls };
};

const cellScaleSelection = (service: ReturnType<typeof createService>) => {
	const previews = service.service.previewCandidates(
		image,
		options,
		analysis,
		CACHE_KEY,
		{ result: rawImage(16, 16), colorCount: 4 },
	);
	const selection = previews.find((preview) => preview.kind === "cell-scale");
	if (!selection) throw new Error("cell-scale candidate was not offered");
	return selection;
};

describe("processing service", () => {
	it("候補プレビューで通した処理を、その候補の選択で繰り返さない", () => {
		const service = createService();
		const selection = cellScaleSelection(service);
		const processedForPreviews = service.calls.length;

		const applied = service.service.processCandidate(
			image,
			options,
			selection,
			CACHE_KEY,
		);

		expect(service.calls.length).toBe(processedForPreviews);
		expect(applied.result.width).toBe(selection.resultWidth);
	});

	it("鍵が違えば候補の結果を作り直す", () => {
		const service = createService();
		const selection = cellScaleSelection(service);
		const processedForPreviews = service.calls.length;

		service.service.processCandidate(image, options, selection, "image-2:{}");

		expect(service.calls.length).toBe(processedForPreviews + 1);
	});

	it("auto-result 候補は既定の設定で確定した結果をそのまま返す", () => {
		const service = createService();
		const base = service.service.process(image, options, CACHE_KEY);
		const selection: CandidateSelection = {
			id: "auto-result:16x16",
			kind: "auto-result",
			recommended: true,
			processingMode: "auto",
		};

		const applied = service.service.processCandidate(
			image,
			options,
			selection,
			CACHE_KEY,
		);

		expect(applied).toBe(base);
		expect(service.calls.length).toBe(1);
	});

	it("結果には比較用の 2 枚を含めず、求められたときだけ返す", () => {
		const service = createService();

		const processed = service.service.process(image, options, CACHE_KEY);
		const compare = service.service.compareImages(
			image,
			options,
			undefined,
			CACHE_KEY,
		);

		expect(processed).not.toHaveProperty("compareBefore");
		expect(Object.keys(compare).sort()).toEqual([
			"compareBefore",
			"compareBeforeSanitized",
		]);
		// 検出済みの格子を引き継ぐので、比較用を作るために検出をやり直さない。
		expect(service.calls[service.calls.length - 1].detectedGrid).toBe(handoff);
	});

	it("候補の処理でも検出済みの格子を引き継ぐ", () => {
		const service = createService();
		service.service.process(image, options, CACHE_KEY);
		const selection: CandidateSelection = {
			id: "cell-scale:double",
			kind: "cell-scale",
			recommended: false,
			processingMode: "refine",
			cellScale: "double",
		};

		service.service.processCandidate(image, options, selection, CACHE_KEY);

		expect(service.calls[service.calls.length - 1].detectedGrid).toBe(handoff);
	});
});
