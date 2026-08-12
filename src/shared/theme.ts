export type ColorTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "pixel-refiner-theme";
export const THEME_QUERY_PARAMETER = "theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const isColorTheme = (value: string | null): value is ColorTheme =>
	value === "light" || value === "dark";

export const resolveColorTheme = (
	storedTheme: string | null,
	prefersDark: boolean,
): ColorTheme => {
	if (isColorTheme(storedTheme)) return storedTheme;
	return prefersDark ? "dark" : "light";
};
