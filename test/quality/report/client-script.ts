import type { QualityReportKind } from "../types";
import {
	applyInitialQualityReportTheme,
	QUALITY_REPORT_THEME_CONFIG,
	runQualityReportClient,
} from "./client";
import { reportTranslations } from "./translations";

const serializedThemeConfig = JSON.stringify(QUALITY_REPORT_THEME_CONFIG);

export const renderThemeBootstrapScript = (): string =>
	`(${applyInitialQualityReportTheme.toString()})(${serializedThemeConfig});`;

export const renderClientScript = (kind: QualityReportKind): string =>
	`window.__QUALITY_REPORT_TRANSLATIONS__=${JSON.stringify(reportTranslations(kind))};` +
	`(${runQualityReportClient.toString()})(${serializedThemeConfig});`;

export const renderThemeToggle = (): string => `<div class="theme-toggle-row">
	<button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false">
		<span class="visually-hidden" data-i18n="toggleTheme">Toggle color theme</span>
		<svg data-theme-icon="light" aria-hidden="true" width="20" height="20"
			viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
			stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="4"></circle>
			<path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path>
		</svg>
		<svg data-theme-icon="dark" aria-hidden="true" width="20" height="20"
			viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
			stroke-linecap="round" stroke-linejoin="round" hidden>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
		</svg>
	</button>
</div>`;
