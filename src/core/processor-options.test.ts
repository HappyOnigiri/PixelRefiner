import { describe, expect, it } from "vitest";
import { PROCESS_DEFAULTS, PROCESS_RANGES } from "../shared/config";
import {
	createDefaultProcessOptions,
	normalizeProcessOptions,
} from "./processor-options";

/**
 * createDefaultProcessOptions が意図的に含めない PROCESS_DEFAULTS のキー。
 *
 * [Intended] ここに挙げていない既定値の取りこぼしはテストで落とす。
 * 新しい既定値を除外する場合は理由とともに追加する。
 */
const EXCLUDED_DEFAULT_KEYS = new Set<string>([
	// UI のグリッド検出モード。ProcessOptions には対応する項目がない。
	"gridDetectionMode",
	// バッチ処理の設定。単体処理の既定には含めない。
	"sharedPalette",
	// 診断出力の設定。呼び出し側が必要なときだけ指定する。
	"includeDiagnosticSummary",
	// 非推奨の旧オプション。normalizeProcessOptions が既定 0 を与える。
	"floatingMaxPixels",
]);

describe("default process options", () => {
	it("covers every shared process default that is not excluded", () => {
		const options = createDefaultProcessOptions() as Record<string, unknown>;

		for (const [key, value] of Object.entries(PROCESS_DEFAULTS)) {
			if (EXCLUDED_DEFAULT_KEYS.has(key)) continue;
			expect(options[key]).toEqual(value);
		}
	});

	it("builds complete defaults from the shared configuration", () => {
		const options = createDefaultProcessOptions();

		expect(options).toMatchObject({
			detectionQuantStep: PROCESS_RANGES.detectionQuantStep.default,
			backgroundMaskTolerance: PROCESS_RANGES.backgroundMaskTolerance.default,
			backgroundTolerance: PROCESS_RANGES.backgroundTolerance.default,
			sampleWindow: PROCESS_RANGES.sampleWindow.default,
			maxSamplesPerCell: PROCESS_RANGES.maxSamplesPerCell.default,
			cellAlphaThreshold: PROCESS_RANGES.cellAlphaThreshold.default,
			trimAlphaThreshold: PROCESS_RANGES.trimAlphaThreshold.default,
			processingMode: PROCESS_DEFAULTS.processingMode,
			detailLevel: PROCESS_DEFAULTS.detailLevel,
			preRemoveBackground: PROCESS_DEFAULTS.preRemoveBackground,
			postRemoveBackground: PROCESS_DEFAULTS.postRemoveBackground,
			bgExtractionMethod: PROCESS_DEFAULTS.bgExtractionMethod,
			bgRemovalScope: PROCESS_DEFAULTS.bgRemovalScope,
			bgConnectivity: PROCESS_DEFAULTS.bgConnectivity,
			trimToContent: PROCESS_DEFAULTS.trimToContent,
			autoGridFromTrimmed: PROCESS_DEFAULTS.autoGridFromTrimmed,
			fastAutoGridFromTrimmed: PROCESS_DEFAULTS.fastAutoGridFromTrimmed,
			enableGridDetection: PROCESS_DEFAULTS.enableGridDetection,
			makeSquare: PROCESS_DEFAULTS.makeSquare,
			keepAspectRatio: PROCESS_DEFAULTS.keepAspectRatio,
			cellSamplingMode: PROCESS_DEFAULTS.cellSamplingMode,
			preserveThinFeatures: PROCESS_DEFAULTS.preserveThinFeatures,
			enableDeskew: PROCESS_DEFAULTS.enableDeskew,
			smallComponentMode: PROCESS_DEFAULTS.smallComponentMode,
			geminiWatermarkRemoval: PROCESS_DEFAULTS.geminiWatermarkRemoval,
			reduceColors: PROCESS_DEFAULTS.reduceColors,
			reduceColorMode: PROCESS_DEFAULTS.reduceColorMode,
			ditherMode: PROCESS_DEFAULTS.ditherMode,
			colorCount: PROCESS_DEFAULTS.colorCount,
			ditherStrength: PROCESS_DEFAULTS.ditherStrength,
			outlineStyle: PROCESS_DEFAULTS.outlineStyle,
			outlineColor: PROCESS_DEFAULTS.outlineColor,
			debug: PROCESS_DEFAULTS.debug,
		});
	});
});

describe("small-component options", () => {
	it("uses an environment-independent debug default", () => {
		const options = normalizeProcessOptions({});

		expect(options.debug).toBe(false);
	});

	it("disables alpha-aware medoid sampling for new callers", () => {
		const options = normalizeProcessOptions({});

		expect(options.cellSamplingMode).toBe("hard-alpha-medoid");
	});

	it("uses Auto for new callers", () => {
		const options = normalizeProcessOptions({});

		expect(options.smallComponentMode).toBe("auto");
		expect(options.geminiWatermarkRemoval).toBe("auto");
		expect(options.floatingMaxPixels).toBe(0);
	});

	it("keeps the explicit legacy pixel threshold", () => {
		const options = normalizeProcessOptions({ floatingMaxPixels: 7 });

		expect(options.smallComponentMode).toBe("off");
		expect(options.floatingMaxPixels).toBe(7);
	});

	it("prefers an explicit new mode when both forms are present", () => {
		const options = normalizeProcessOptions({
			smallComponentMode: "strong",
			floatingMaxPixels: 7,
		});

		expect(options.smallComponentMode).toBe("strong");
		expect(options.floatingMaxPixels).toBe(0);
	});
});
