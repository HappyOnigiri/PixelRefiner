import { afterEach, describe, expect, it, vi } from "vitest";
import { runQualityReportClient } from "./client";

type Listener = () => void;

type MockElement = {
	dataset: Record<string, string>;
	hidden: boolean;
	value: string;
	textContent: string;
	classList: { toggle: ReturnType<typeof vi.fn> };
	setAttribute: ReturnType<typeof vi.fn>;
	addEventListener: (type: string, listener: Listener) => void;
	querySelector: (selector: string) => MockElement | null;
	trigger: (type: string) => void;
};

const makeElement = (
	dataset: Record<string, string> = {},
	label?: string,
): MockElement => {
	const listeners = new Map<string, Listener[]>();
	const labelElement =
		label === undefined
			? null
			: ({
					textContent: label,
				} as MockElement);
	const element: MockElement = {
		dataset,
		hidden: false,
		value: "",
		textContent: "",
		classList: { toggle: vi.fn() },
		setAttribute: vi.fn(),
		addEventListener(type, listener) {
			const entries = listeners.get(type) ?? [];
			entries.push(listener);
			listeners.set(type, entries);
		},
		querySelector: (selector) =>
			selector === "[data-i18n]" ? labelElement : null,
		trigger(type) {
			for (const listener of listeners.get(type) ?? []) listener();
		},
	};
	return element;
};

const makeButton = (name: string, value: string, label: string): MockElement =>
	makeElement({ [`${name}Filter`]: value }, label);

type MockLink = {
	getAttribute: (name: string) => string | null;
	setAttribute: (name: string, value: string) => void;
};

const makeLink = (href: string): MockLink => {
	const attributes: Record<string, string> = { href };
	return {
		getAttribute: (name) => attributes[name] ?? null,
		setAttribute: (name, value) => {
			attributes[name] = value;
		},
	};
};

const createReportPage = (query = "") => {
	const search = makeElement();
	const visibleCount = makeElement();
	const activeLabels = {
		quality: makeElement(),
		change: makeElement(),
		parameter: makeElement(),
	};
	const qualityButtons = [
		makeButton("quality", "", "All"),
		makeButton("quality", "unmet", "Target unmet"),
		makeButton("quality", "met", "Target met"),
	];
	const changeButtons = [
		makeButton("change", "", "All"),
		makeButton("change", "changed", "Changed"),
		makeButton("change", "unchanged", "Unchanged"),
		makeButton("change", "new", "New"),
	];
	const parameterButtons = [
		makeButton("parameter", "", "All"),
		makeButton("parameter", "auto", "Auto"),
	];
	const cards = [
		makeElement({
			search: "auto target-unmet",
			quality: "unmet",
			change: "changed",
			parameter: "auto",
		}),
		makeElement({
			search: "auto target-met",
			quality: "met",
			change: "unchanged",
			parameter: "auto",
		}),
		makeElement({
			search: "manual target-unmet",
			quality: "unmet",
			change: "new",
			parameter: "auto",
		}),
	];
	const localeButtons = [
		makeElement({ locale: "ja" }),
		makeElement({ locale: "en" }),
		makeElement({ locale: "zh-CN" }),
	];
	const detailLink = makeLink("cases/restore-bilinear-to-8x8/index.html");
	const selectorGroups: Record<string, MockElement[]> = {
		"[data-quality-filter]": qualityButtons,
		"[data-change-filter]": changeButtons,
		"[data-parameter-filter]": parameterButtons,
	};
	const selectorElements: Record<string, MockElement | null> = {
		"#search": search,
		"#visible-count": visibleCount,
		"#active-quality-label": activeLabels.quality,
		"#active-change-label": activeLabels.change,
		"#active-parameter-label": activeLabels.parameter,
		"#image-dialog": null,
	};
	const documentMock = {
		documentElement: { lang: "" },
		querySelectorAll(selector: string): (MockElement | MockLink)[] {
			if (selector === ".case") return cards;
			if (selector === ".images img") return [];
			if (selector === "[data-locale]") return localeButtons;
			if (selector === "a.detail-link, a.back-link") return [detailLink];
			if (selector === "[data-i18n]" || selector === "[data-i18n-alt]") {
				return [];
			}
			return selectorGroups[selector] ?? [];
		},
		querySelector(selector: string): MockElement | null {
			return selectorElements[selector] ?? null;
		},
	} as unknown as Document;
	const location = new URL(`https://example.test/report/index.html${query}`);
	const replaceState = vi.fn(
		(_state: unknown, _title: string, nextUrl: string) => {
			const nextLocation = new URL(nextUrl, location.href);
			location.href = nextLocation.href;
			location.search = nextLocation.search;
			location.hash = nextLocation.hash;
		},
	);
	const windowMock = {
		__QUALITY_REPORT_TRANSLATIONS__: { en: {}, ja: {}, "zh-CN": {} },
		location,
		history: {
			replaceState,
		},
		addEventListener: vi.fn(),
	} as unknown as Window;
	return {
		cards,
		qualityButtons,
		changeButtons,
		localeButtons,
		detailLink,
		search,
		documentMock,
		windowMock,
		replaceState,
	};
};

/** ケース詳細ページ。サイドバーが無いので絞り込みも言語ボタンも持たない。 */
const createCaseDetailPage = (query = "") => {
	const backLink = makeLink("../../index.html");
	const documentMock = {
		documentElement: { lang: "" },
		querySelectorAll(selector: string): (MockElement | MockLink)[] {
			if (selector === "a.detail-link, a.back-link") return [backLink];
			return [];
		},
		querySelector: (): MockElement | null => null,
	} as unknown as Document;
	const location = new URL(
		`https://example.test/report/cases/restore-bilinear-to-8x8/index.html${query}`,
	);
	const replaceState = vi.fn(
		(_state: unknown, _title: string, nextUrl: string) => {
			const nextLocation = new URL(nextUrl, location.href);
			location.href = nextLocation.href;
			location.search = nextLocation.search;
			location.hash = nextLocation.hash;
		},
	);
	const windowMock = {
		__QUALITY_REPORT_TRANSLATIONS__: { en: {}, ja: {}, "zh-CN": {} },
		location,
		history: { replaceState },
		addEventListener: vi.fn(),
	} as unknown as Window;
	return { backLink, documentMock, windowMock, replaceState };
};

const runPage = (page: {
	documentMock: Document;
	windowMock: Window;
}): void => {
	vi.stubGlobal("document", page.documentMock);
	vi.stubGlobal("window", page.windowMock);
	vi.stubGlobal("navigator", { languages: ["en"], language: "en" });
	runQualityReportClient();
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("quality report filter query state", () => {
	it("starts with all cases and restores query filters after reload", () => {
		const firstPage = createReportPage();
		runPage(firstPage);
		expect(firstPage.search.value).toBe("");
		expect(firstPage.cards.every((card) => !card.hidden)).toBe(true);

		firstPage.qualityButtons[1].trigger("click");
		firstPage.changeButtons[1].trigger("click");
		firstPage.search.value = "auto";
		firstPage.search.trigger("input");

		const params = new URL(firstPage.windowMock.location.href).searchParams;
		expect(params.get("search")).toBe("auto");
		expect(params.get("quality")).toBe("unmet");
		expect(params.get("change")).toBe("changed");
		expect(params.has("parameter")).toBe(false);
		expect(firstPage.replaceState).toHaveBeenCalledTimes(3);

		const secondPage = createReportPage(`?${params.toString()}`);
		runPage(secondPage);

		expect(secondPage.search.value).toBe("auto");
		expect(secondPage.qualityButtons[1].classList.toggle).toHaveBeenCalledWith(
			"active",
			true,
		);
		expect(secondPage.changeButtons[1].classList.toggle).toHaveBeenCalledWith(
			"active",
			true,
		);
		expect(secondPage.cards[0].hidden).toBe(false);
		expect(secondPage.cards[1].hidden).toBe(true);
		expect(secondPage.cards[2].hidden).toBe(true);
	});

	// [Intended] 他の軸を掛けると別の理由でカードが消えるため、前回比較の3状態が
	// カードの data-change と噛み合っているかは change 軸だけで確かめる。
	it("filters cases by the change axis alone", () => {
		const page = createReportPage();
		runPage(page);

		page.changeButtons[1].trigger("click");
		expect(page.cards.map((card) => card.hidden)).toEqual([false, true, true]);

		page.changeButtons[2].trigger("click");
		expect(page.cards.map((card) => card.hidden)).toEqual([true, false, true]);

		page.changeButtons[3].trigger("click");
		expect(page.cards.map((card) => card.hidden)).toEqual([true, true, false]);
	});
});

describe("quality report locale query state", () => {
	it("carries an explicitly chosen locale into the URL and case links", () => {
		const page = createReportPage();
		runPage(page);

		// [Intended] ブラウザ言語のままなら遷移先でも同じ判定になるので、選ばれるまでは
		// クエリもリンクも書き換えない。
		expect(page.detailLink.getAttribute("href")).toBe(
			"cases/restore-bilinear-to-8x8/index.html",
		);
		expect(
			new URL(page.windowMock.location.href).searchParams.has("locale"),
		).toBe(false);

		page.localeButtons[2].trigger("click");

		expect(page.documentMock.documentElement.lang).toBe("zh-CN");
		expect(
			new URL(page.windowMock.location.href).searchParams.get("locale"),
		).toBe("zh-CN");
		expect(page.detailLink.getAttribute("href")).toBe(
			"cases/restore-bilinear-to-8x8/index.html?locale=zh-CN",
		);
	});

	it("restores the locale from the query on a case detail page", () => {
		const page = createCaseDetailPage("?locale=ja");
		runPage(page);

		expect(page.documentMock.documentElement.lang).toBe("ja");
		expect(page.backLink.getAttribute("href")).toBe(
			"../../index.html?locale=ja",
		);
	});

	it("falls back to the browser language for an unknown locale", () => {
		const page = createCaseDetailPage("?locale=fr");
		runPage(page);

		expect(page.documentMock.documentElement.lang).toBe("en");
		expect(page.backLink.getAttribute("href")).toBe("../../index.html");
	});
});
