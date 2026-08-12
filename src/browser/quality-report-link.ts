import { type ColorTheme, isColorTheme } from "../shared/theme";
import { i18n } from "./i18n";

/**
 * main の最新コミットで生成した品質レポートの公開先。
 * [Policy] .github/workflows/quality-report-main.yml が gh-pages のこのパスへ公開する。
 * 変える場合は workflow と README の記載も同時に直す。
 */
export const QUALITY_REPORT_URL =
	"https://happyonigiri.github.io/PixelRefiner/quality/latest/";

/**
 * レポートを UI と同じ言語・配色で開くための URL。
 * レポート側は locale と theme のクエリを読み、指定があれば保存済みの選択より優先する。
 */
export const qualityReportUrl = (
	language: string,
	theme: ColorTheme,
): string => {
	const url = new URL(QUALITY_REPORT_URL);
	url.searchParams.set("locale", language);
	url.searchParams.set("theme", theme);
	return url.toString();
};

const currentTheme = (): ColorTheme => {
	const theme = document.documentElement.dataset.theme ?? null;
	return isColorTheme(theme) ? theme : "light";
};

export const initQualityReportLink = (): void => {
	const link = document.querySelector<HTMLAnchorElement>(
		"[data-quality-report-link]",
	);
	if (!link) return;
	const applyUrl = (): void => {
		link.href = qualityReportUrl(i18n.currentLang, currentTheme());
	};
	applyUrl();
	// [Intended] 言語も配色も開くまでに切り替えられるので、クリックのたびに組み立て直す。
	// 変更を購読するより、リンクを開く瞬間の表示状態と必ず一致する。
	link.addEventListener("click", applyUrl);
};
