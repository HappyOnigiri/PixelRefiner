import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";
import { initApp } from "./app";
import { initQualityReportLink } from "./quality-report-link";
import { initTheme } from "./theme";
import { initTooltip } from "./tooltip";
import "./style.css";

initTheme();
inject();
injectSpeedInsights();

window.addEventListener("DOMContentLoaded", () => {
	initApp();

	// package.json のバージョンを設定（Vite define 経由）
	const versionEl = document.getElementById("app-version");
	if (versionEl) {
		versionEl.textContent = `v${import.meta.env.APP_VERSION}`;
	}

	initQualityReportLink();
	initTooltip();
});
