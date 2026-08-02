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
});
