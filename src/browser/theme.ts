import {
	type ColorTheme,
	isColorTheme,
	resolveColorTheme,
	THEME_MEDIA_QUERY,
	THEME_STORAGE_KEY,
} from "../shared/theme";

const THEME_COLORS: Record<ColorTheme, string> = {
	light: "#f7f8fc",
	dark: "#0f1115",
};

const readSavedTheme = (): ColorTheme | null => {
	try {
		const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
		return isColorTheme(savedTheme) ? savedTheme : null;
	} catch {
		// [Workaround] 保存領域を利用できない環境でもテーマ選択を妨げない。
		return null;
	}
};

const saveTheme = (theme: ColorTheme): void => {
	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, theme);
	} catch {
		// [Workaround] 保存に失敗しても現在のページでは手動選択を維持する。
	}
};

export const initTheme = (): void => {
	const mediaQuery =
		typeof window.matchMedia === "function"
			? window.matchMedia(THEME_MEDIA_QUERY)
			: null;
	const savedTheme = readSavedTheme();
	let manuallySelected = savedTheme !== null;
	let currentTheme = resolveColorTheme(
		savedTheme,
		mediaQuery?.matches === true,
	);
	const themeToggle = document.querySelector<HTMLButtonElement>(
		"[data-theme-toggle]",
	);

	const applyTheme = (theme: ColorTheme): void => {
		currentTheme = theme;
		document.documentElement.dataset.theme = theme;
		document.documentElement.style.colorScheme = theme;
		document
			.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
			?.setAttribute("content", THEME_COLORS[theme]);
		if (!themeToggle) return;
		themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
		for (const icon of themeToggle.querySelectorAll<SVGElement>(
			"[data-theme-icon]",
		)) {
			icon.toggleAttribute("hidden", icon.dataset.themeIcon !== theme);
		}
	};

	applyTheme(currentTheme);
	themeToggle?.addEventListener("click", () => {
		manuallySelected = true;
		const nextTheme = currentTheme === "light" ? "dark" : "light";
		applyTheme(nextTheme);
		saveTheme(nextTheme);
	});
	mediaQuery?.addEventListener("change", (event) => {
		if (!manuallySelected) applyTheme(event.matches ? "dark" : "light");
	});
};
