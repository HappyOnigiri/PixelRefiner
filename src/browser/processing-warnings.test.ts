import { afterEach, describe, expect, it } from "vitest";
import { i18n, type Language } from "./i18n";
import {
	translateProcessingWarning,
	translateProcessingWarnings,
} from "./processing-warnings";

const originalLanguage: Language = i18n.currentLang;

afterEach(() => {
	i18n.currentLang = originalLanguage;
});

describe("translateProcessingWarning", () => {
	it("translates known warning codes", () => {
		i18n.currentLang = "en";
		expect(translateProcessingWarning("CONTENT_LOSS_RISK")).toContain(
			"removed",
		);
	});

	it("falls back safely for warning codes added by newer workers", () => {
		i18n.currentLang = "en";
		expect(translateProcessingWarning("FUTURE_WARNING")).toBe(
			"Unknown processing warning (FUTURE_WARNING).",
		);
	});
});

describe("translateProcessingWarnings", () => {
	it("複数の警告をアイコンのツールチップ用に翻訳する", () => {
		i18n.currentLang = "ja";
		expect(
			translateProcessingWarnings([
				"LOW_GRID_CONFIDENCE",
				"EXTREME_OUTPUT_SIZE",
			]),
		).toEqual([
			"グリッド判定の信頼度が低いため、結果を確認してください。",
			"出力サイズが非常に大きくなっています。",
		]);
	});
});
