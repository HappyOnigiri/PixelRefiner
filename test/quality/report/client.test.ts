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
		querySelectorAll(selector: string): MockElement[] {
			if (selector === ".case") return cards;
			if (selector === ".images img") return [];
			if (selector === "[data-locale]") return [];
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
		search,
		documentMock,
		windowMock,
		replaceState,
	};
};

const runPage = (page: ReturnType<typeof createReportPage>): void => {
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
});
