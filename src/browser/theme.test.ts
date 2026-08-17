import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "../shared/theme";
import { initTheme } from "./theme";

type ThemeListener = (event: { matches: boolean }) => void;

const createPage = (savedTheme: string | null, prefersDark: boolean) => {
	const icons = [
		{
			dataset: { themeIcon: "light" },
			hidden: false,
			toggleAttribute(_name: string, force: boolean) {
				this.hidden = force;
			},
		},
		{
			dataset: { themeIcon: "dark" },
			hidden: false,
			toggleAttribute(_name: string, force: boolean) {
				this.hidden = force;
			},
		},
	];
	let clickListener = (): void => {
		// 登録前の初期値。実際のリスナーで置き換わる
	};
	let mediaListener: ThemeListener = () => {
		// 登録前の初期値。実際のリスナーで置き換わる
	};
	const themeToggle = {
		setAttribute: vi.fn(),
		querySelectorAll: () => icons,
		addEventListener: (_type: string, listener: () => void) => {
			clickListener = listener;
		},
	};
	const themeMeta = { setAttribute: vi.fn() };
	const documentElement = {
		dataset: {} as Record<string, string>,
		style: { colorScheme: "" },
	};
	const storage = {
		getItem: vi.fn(() => savedTheme),
		setItem: vi.fn(),
	};
	const windowMock = {
		localStorage: storage,
		matchMedia: vi.fn(() => ({
			matches: prefersDark,
			addEventListener: (_type: string, listener: ThemeListener) => {
				mediaListener = listener;
			},
		})),
	};
	const documentMock = {
		documentElement,
		querySelector: (selector: string) =>
			selector === "[data-theme-toggle]" ? themeToggle : themeMeta,
	};
	vi.stubGlobal("window", windowMock);
	vi.stubGlobal("document", documentMock);
	initTheme();
	return {
		click: () => clickListener(),
		changeOsTheme: (matches: boolean) => mediaListener({ matches }),
		documentElement,
		icons,
		storage,
		themeToggle,
	};
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("initTheme", () => {
	it("uses the saved theme before the OS preference", () => {
		const page = createPage("light", true);
		expect(page.documentElement.dataset.theme).toBe("light");
		expect(page.icons.map((icon) => icon.hidden)).toEqual([false, true]);
	});

	it("uses the OS preference and follows it until a manual selection", () => {
		const page = createPage(null, true);
		expect(page.documentElement.dataset.theme).toBe("dark");
		page.changeOsTheme(false);
		expect(page.documentElement.dataset.theme).toBe("light");
	});

	it("saves a manual selection and keeps exactly one icon visible", () => {
		const page = createPage(null, false);
		page.click();
		expect(page.documentElement.dataset.theme).toBe("dark");
		expect(page.icons.map((icon) => icon.hidden)).toEqual([true, false]);
		expect(page.storage.setItem).toHaveBeenCalledWith(
			THEME_STORAGE_KEY,
			"dark",
		);
		page.changeOsTheme(false);
		expect(page.documentElement.dataset.theme).toBe("dark");
	});
});
