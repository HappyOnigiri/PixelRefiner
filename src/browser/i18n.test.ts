import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { I18nManager } from "./i18n";

// localStorage をモック
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value.toString();
		},
		clear: () => {
			store = {};
		},
	};
})();

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"localStorage",
);
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"navigator",
);

const restoreGlobalDescriptor = (
	key: "localStorage" | "navigator",
	descriptor: PropertyDescriptor | undefined,
) => {
	if (descriptor) {
		Object.defineProperty(globalThis, key, descriptor);
		return;
	}

	Reflect.deleteProperty(globalThis, key);
};

if (typeof globalThis !== "undefined") {
	Object.defineProperty(globalThis, "localStorage", {
		value: localStorageMock,
		configurable: true,
	});

	// navigator をモック
	Object.defineProperty(globalThis, "navigator", {
		value: {
			language: "en-US",
		},
		writable: true,
		configurable: true,
	});
}

describe("I18nManager", () => {
	afterAll(() => {
		restoreGlobalDescriptor("localStorage", originalLocalStorageDescriptor);
		restoreGlobalDescriptor("navigator", originalNavigatorDescriptor);
	});

	beforeEach(() => {
		localStorageMock.clear();
		// navigator の言語をリセット
		Object.defineProperty(navigator, "language", {
			value: "en-US",
			writable: true,
		});
	});

	it("should translate simple keys", () => {
		const i18n = new I18nManager();
		i18n.setLanguage("en");
		expect(i18n.t("error.process_failed")).toBe("Processing failed");

		i18n.setLanguage("ja");
		expect(i18n.t("error.process_failed")).toBe("処理失敗");

		i18n.setLanguage("zh-CN");
		expect(i18n.t("error.process_failed")).toBe("处理失败");
	});

	it("provides batch labels in every supported language", () => {
		const i18n = new I18nManager();
		for (const language of ["ja", "en", "zh-CN"] as const) {
			i18n.setLanguage(language);
			expect(i18n.t("ui.shared_palette")).not.toBe("ui.shared_palette");
			expect(i18n.t("ui.include_diagnostics")).not.toBe(
				"ui.include_diagnostics",
			);
			expect(i18n.t("batch.status.done")).not.toBe("batch.status.done");
			expect(i18n.t("tooltip.help.shared_palette")).not.toBe(
				"tooltip.help.shared_palette",
			);
			expect(i18n.t("tooltip.help.include_diagnostics")).not.toBe(
				"tooltip.help.include_diagnostics",
			);
			expect(
				i18n.t("warning.batch_partial_failure", { failed: 1, total: 3 }),
			).toContain("1");
		}
	});

	it("should interpolate parameters", () => {
		const i18n = new I18nManager();
		i18n.setLanguage("en");

		const msgEn = i18n.t("error.palette_limit", { count: 512 });
		expect(msgEn).toBe(
			"Warning: The image contains 512 colors. Palette will be limited to 256 colors.",
		);

		i18n.setLanguage("ja");
		const msgJa = i18n.t("error.palette_limit", { count: 1234 });
		expect(msgJa).toBe(
			"警告: 画像には1234色が含まれています。パレットは256色に制限されます。",
		);

		i18n.setLanguage("zh-CN");
		const msgZh = i18n.t("error.palette_limit", { count: 256 });
		expect(msgZh).toBe("警告：图片包含256种颜色。调色板将限制为256色。");
	});

	it("should select zh-CN for Chinese browser language", () => {
		Object.defineProperty(navigator, "language", {
			value: "zh-CN",
			writable: true,
		});

		const i18n = new I18nManager();
		expect(i18n.currentLang).toBe("zh-CN");
	});

	it("should select zh-CN for Chinese browser language variants", () => {
		Object.defineProperty(navigator, "language", {
			value: "zh-Hans-CN",
			writable: true,
		});

		const i18n = new I18nManager();
		expect(i18n.currentLang).toBe("zh-CN");
	});

	it("should store zh-CN in localStorage", () => {
		const i18n = new I18nManager();
		i18n.setLanguage("zh-CN");

		expect(localStorageMock.getItem("pixel-refiner-lang")).toBe("zh-CN");
	});

	it("should ignore invalid saved language and fall back to browser language", () => {
		localStorageMock.setItem("pixel-refiner-lang", "fr");
		Object.defineProperty(navigator, "language", {
			value: "ja-JP",
			writable: true,
		});

		const i18n = new I18nManager();
		expect(i18n.currentLang).toBe("ja");
	});

	it("should return key if translation is missing", () => {
		const i18n = new I18nManager();
		// @ts-expect-error
		expect(i18n.t("non.existent.key")).toBe("non.existent.key");
	});

	it("should translate quick settings and processing analysis in every language", () => {
		const i18n = new I18nManager();
		for (const lang of ["ja", "en", "zh-CN"] as const) {
			i18n.setLanguage(lang);
			expect(i18n.t("preset.photo_to_pixel")).not.toBe("preset.photo_to_pixel");
			for (const key of [
				"setting.quick_finish",
				"setting.quick_pixel_detail",
				"setting.quick_colors",
				"setting.quick_background",
				"setting.quick_gradient",
				"setting.quick_canvas",
				"option.quick_processing_auto",
				"option.quick_processing_refine",
				"option.quick_processing_convert",
				"option.quick_processing_preserve",
				"option.quick_colors_original",
				"tooltip.help.quick_preset",
				"tooltip.help.quick_processing_mode",
				"tooltip.help.quick_detail",
				"tooltip.help.quick_reduction_mode",
				"tooltip.help.quick_background",
				"tooltip.help.quick_dithering",
				"tooltip.help.quick_auto_trim",
				"option.auto_trim_auto",
				"option.auto_trim_none",
				"option.size_very_small",
				"option.size_small",
				"option.size_slightly_small",
				"option.size_standard",
				"option.size_large",
			] as const) {
				expect(i18n.t(key)).not.toBe(key);
			}
			expect(i18n.t("classification.scaled-pixel")).not.toBe(
				"classification.scaled-pixel",
			);
			expect(
				i18n.t("result.analysis", {
					classification: "Image",
					route: "Convert",
					confidence: 80,
				}),
			).toContain("80");
		}

		i18n.setLanguage("ja");
		expect(i18n.t("option.quick_processing_refine")).toBe("輪郭をくっきり");
		expect(i18n.t("option.quick_processing_convert")).toBe(
			"細部を残してドット化",
		);
		expect(i18n.t("option.quick_processing_refine")).not.toBe(
			i18n.t("option.processing_refine"),
		);
		expect(i18n.t("preset.limited_colors")).toBe("16色レトロ");
	});

	it("registers small-component controls in every language", () => {
		const i18n = new I18nManager();
		for (const language of ["ja", "en", "zh-CN"] as const) {
			i18n.setLanguage(language);
			for (const key of [
				"setting.small_component_mode",
				"tooltip.help.small_component_mode",
				"option.small_component_off",
				"option.small_component_light",
				"option.small_component_auto",
				"option.small_component_strong",
			] as const) {
				expect(i18n.t(key)).not.toBe(key);
			}
		}
	});

	it("registers guide page copy in every language", () => {
		const i18n = new I18nManager();
		for (const language of ["ja", "en", "zh-CN"] as const) {
			i18n.setLanguage(language);
			for (const key of [
				"app.guide_link",
				"guide.page_title",
				"guide.page_name",
				"guide.subtitle",
				"guide.back_to_app",
				"guide.copy_prompt",
				"guide.copied",
				"guide.intro.heading",
				"guide.intro.body2",
				"guide.intro.fixable_1",
				"guide.intro.unfixable_5",
				"guide.principles.heading",
				"guide.principles.p1_heading",
				"guide.principles.p5_body",
				"guide.principles.no_effort_body",
				"guide.recipes.heading",
				"guide.recipes.goal_label",
				"guide.recipes.settings_label",
				"guide.recipes.caption_input",
				"guide.recipes.caption_output",
				"guide.recipe1.settings",
				"guide.recipe3.input_alt",
				"guide.recipe5.output_alt",
				"guide.troubleshooting.heading",
				"guide.troubleshooting.col_symptom",
				"guide.troubleshooting.r1_fix",
				"guide.notes.body",
			] as const) {
				expect(i18n.t(key)).not.toBe(key);
			}
		}
	});

	it("registers Gemini watermark controls in every language", () => {
		const i18n = new I18nManager();
		for (const language of ["ja", "en", "zh-CN"] as const) {
			i18n.setLanguage(language);
			for (const key of [
				"setting.gemini_watermark_removal",
				"tooltip.help.gemini_watermark_removal",
				"option.gemini_watermark_auto",
				"option.gemini_watermark_off",
			] as const) {
				expect(i18n.t(key)).not.toBe(key);
			}
		}
	});
});
