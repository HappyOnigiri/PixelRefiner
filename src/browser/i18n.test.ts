import { beforeEach, describe, expect, it } from "vitest";
import { I18nManager } from "./i18n";

// Mock localStorage
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

if (typeof global !== "undefined") {
	Object.defineProperty(global, "localStorage", {
		value: localStorageMock,
		configurable: true,
	});

	// Mock navigator
	Object.defineProperty(global, "navigator", {
		value: {
			language: "en-US",
		},
		writable: true,
		configurable: true,
	});
}

describe("I18nManager", () => {
	beforeEach(() => {
		localStorageMock.clear();
		// Reset navigator language
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
	});

	it("should return key if translation is missing", () => {
		const i18n = new I18nManager();
		// @ts-expect-error
		expect(i18n.t("non.existent.key")).toBe("non.existent.key");
	});
});
