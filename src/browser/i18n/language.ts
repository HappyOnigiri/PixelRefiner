export type Language = "ja" | "en" | "zh-CN";

export const LANGUAGES: readonly Language[] = ["ja", "en", "zh-CN"];

export const isLanguage = (value: string | null): value is Language =>
	value === "ja" || value === "en" || value === "zh-CN";

export const detectBrowserLanguage = (): Language => {
	const lang = typeof navigator !== "undefined" ? navigator.language : "";
	if (lang.startsWith("zh")) {
		return "zh-CN";
	}
	if (lang.startsWith("ja")) {
		return "ja";
	}
	return "en";
};
