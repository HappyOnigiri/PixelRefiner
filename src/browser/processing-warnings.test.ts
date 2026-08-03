import { afterEach, describe, expect, it } from "vitest";
import { i18n, type Language } from "./i18n";
import {
	shouldNotifyProcessingWarnings,
	translateProcessingWarning,
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

describe("shouldNotifyProcessingWarnings", () => {
	it("候補モーダルが表示された場合は重複する通知を抑止する", () => {
		expect(
			shouldNotifyProcessingWarnings(
				["LOW_GRID_CONFIDENCE", "EXTREME_OUTPUT_SIZE"],
				true,
			),
		).toBe(false);
	});

	it("候補モーダルを表示できない場合は通知を残す", () => {
		expect(shouldNotifyProcessingWarnings(["LOW_GRID_CONFIDENCE"], false)).toBe(
			true,
		);
	});

	it("警告がない場合は通知しない", () => {
		expect(shouldNotifyProcessingWarnings([], false)).toBe(false);
	});
});
