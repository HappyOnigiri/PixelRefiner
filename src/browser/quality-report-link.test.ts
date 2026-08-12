import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n } from "./i18n";
import {
	initQualityReportLink,
	QUALITY_REPORT_URL,
	qualityReportUrl,
} from "./quality-report-link";

const createPage = (theme: string | undefined, hasLink = true) => {
	let clickListener = (): void => {};
	const link = {
		href: "",
		addEventListener: (_type: string, listener: () => void): void => {
			clickListener = listener;
		},
	};
	const documentElement = { dataset: { theme } as { theme?: string } };
	vi.stubGlobal("document", {
		documentElement,
		querySelector: (selector: string) =>
			hasLink && selector === "[data-quality-report-link]" ? link : null,
	});
	return { link, documentElement, click: () => clickListener() };
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("quality report link", () => {
	it("carries the display language and color theme as query parameters", () => {
		expect(qualityReportUrl("ja", "dark")).toBe(
			`${QUALITY_REPORT_URL}?locale=ja&theme=dark`,
		);
	});

	it("points at the published report with the current UI settings", () => {
		const page = createPage("dark");
		i18n.currentLang = "zh-CN";
		initQualityReportLink();
		expect(page.link.href).toBe(
			`${QUALITY_REPORT_URL}?locale=zh-CN&theme=dark`,
		);
	});

	// [Intended] 言語も配色もリンクを開くまでに切り替えられる。初期化時の値のまま
	// 開くと、UI と違う見た目のレポートが出る。
	it("rebuilds the URL from the state at click time", () => {
		const page = createPage("light");
		i18n.currentLang = "en";
		initQualityReportLink();
		i18n.currentLang = "ja";
		page.documentElement.dataset.theme = "dark";
		page.click();
		expect(page.link.href).toBe(`${QUALITY_REPORT_URL}?locale=ja&theme=dark`);
	});

	it("falls back to the light theme when the document has no theme yet", () => {
		const page = createPage(undefined);
		i18n.currentLang = "en";
		initQualityReportLink();
		expect(page.link.href).toBe(`${QUALITY_REPORT_URL}?locale=en&theme=light`);
	});

	it("does nothing when the footer has no report link", () => {
		createPage("dark", false);
		expect(() => initQualityReportLink()).not.toThrow();
	});
});
