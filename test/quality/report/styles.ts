const REPORT_THEME_STYLES = `
:root {
	color-scheme: light;
	font-family: system-ui, sans-serif;
	background: #f7f8fc;
	color: #172033;
	--report-bg: #f7f8fc;
	--report-panel: #ffffff;
	--report-panel-muted: #f0f3f8;
	--report-control: #eef2f7;
	--report-border: #ccd4e0;
	--report-border-strong: #8995a7;
	--report-text: #172033;
	--report-text-muted: #526077;
	--report-text-dim: #687386;
	--report-link: #4f46e5;
	--report-focus: #6d5bd0;
	--report-active-outline: #4f46e5;
	--report-active-shadow: #4f46e522;
	--report-hover: #e4e8ef;
	--report-badge: #e5e7eb;
	--report-purple: #e5def8;
	--report-danger: #f8d4d7;
	--report-success: #ccebd9;
	--report-neutral: #dce4f1;
	--report-warning: #f8e4ad;
	--report-auto: #d3e7f8;
	--report-explicit: #e4dff0;
	--report-orange: #f7ddc3;
	--report-cyan: #ccebed;
	--report-danger-border: #d64550;
	--report-danger-text: #b4232f;
	--report-success-text: #18713f;
}
:root[data-theme="dark"] {
	color-scheme: dark;
	background: #15131a;
	color: #f4efff;
	--report-bg: #15131a;
	--report-panel: #1d1923;
	--report-panel-muted: #25212d;
	--report-control: #302a39;
	--report-border: #494151;
	--report-border-strong: #635a70;
	--report-text: #f4efff;
	--report-text-muted: #d6cce4;
	--report-text-dim: #aaa0b8;
	--report-link: #b9a7ff;
	--report-focus: #c2b4ff;
	--report-active-outline: #ffffff;
	--report-active-shadow: #ffffff22;
	--report-hover: #3b3346;
	--report-badge: #393241;
	--report-purple: #59458a;
	--report-danger: #7a2930;
	--report-success: #236044;
	--report-neutral: #48536b;
	--report-warning: #725b20;
	--report-auto: #2d4a6b;
	--report-explicit: #3d3550;
	--report-orange: #8a4b16;
	--report-cyan: #1f5f6b;
	--report-danger-border: #ff6b6b;
	--report-danger-text: #ffb0b0;
	--report-success-text: #85e6a9;
}
@media (prefers-color-scheme: dark) {
	:root:not([data-theme]) {
		color-scheme: dark;
		background: #15131a;
		color: #f4efff;
		--report-bg: #15131a;
		--report-panel: #1d1923;
		--report-panel-muted: #25212d;
		--report-control: #302a39;
		--report-border: #494151;
		--report-border-strong: #635a70;
		--report-text: #f4efff;
		--report-text-muted: #d6cce4;
		--report-text-dim: #aaa0b8;
		--report-link: #b9a7ff;
		--report-focus: #c2b4ff;
		--report-active-outline: #ffffff;
		--report-active-shadow: #ffffff22;
		--report-hover: #3b3346;
		--report-badge: #393241;
		--report-purple: #59458a;
		--report-danger: #7a2930;
		--report-success: #236044;
		--report-neutral: #48536b;
		--report-warning: #725b20;
		--report-auto: #2d4a6b;
		--report-explicit: #3d3550;
		--report-orange: #8a4b16;
		--report-cyan: #1f5f6b;
		--report-danger-border: #ff6b6b;
		--report-danger-text: #ffb0b0;
		--report-success-text: #85e6a9;
	}
}
body { background: var(--report-bg); color: var(--report-text); }
a { color: var(--report-link); }
.visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
.theme-toggle-row { display: flex; justify-content: flex-end; margin-top: auto; }
.theme-toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 36px;
	height: 36px;
	padding: 0;
	color: var(--report-text-muted);
	background: var(--report-control);
	border: 1px solid var(--report-border-strong);
	border-radius: 50%;
	cursor: pointer;
}
.theme-toggle:hover { color: var(--report-link); border-color: var(--report-focus); }
.theme-toggle:focus-visible { outline: 2px solid var(--report-focus); outline-offset: 2px; }
.theme-toggle [hidden] { display: none; }
`;

export const INDEX_REPORT_STYLES = `${REPORT_THEME_STYLES}
body { margin: 0 auto; max-width: 1800px; padding: 20px; }
.report-layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; grid-template-areas: "main sidebar"; gap: 24px; align-items: start; }
.sidebar {
	grid-area: sidebar;
	position: sticky;
	top: 16px;
	margin-bottom: 20px;
	display: grid;
	gap: 14px;
	max-height: calc(100vh - 32px);
	overflow: auto;
	padding: 16px;
	border: 1px solid var(--report-border);
	border-radius: 10px;
	background: var(--report-panel);
}
.report-main { grid-area: main; }
.sidebar h1 { margin: 0; font-size: 1.2rem; }
.report-overview { display: grid; gap: 4px; }
.report-overview p { margin: 0; font-size: .88rem; }
.report-meta h2 { margin: 0 0 6px; font-size: .85rem; color: var(--report-text-muted); }
.report-meta dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 8px; margin: 0; font-size: .78rem; }
.report-meta dt { color: var(--report-text-dim); }
.report-meta dd { margin: 0; overflow-wrap: anywhere; }
.report-meta code { font-size: inherit; }
.previous-run-note { margin: 6px 0 0; font-size: .75rem; color: var(--report-text-dim); }
.filter-panel { display: grid; gap: 10px; }
.filter-group { margin: 0; padding: 8px; border: 1px solid var(--report-border); border-radius: 8px; background: var(--report-panel-muted); }
.filter-group legend { padding: 0 4px; font-size: .82rem; font-weight: 700; }
.filter-row { display: grid; gap: 5px; }
.locale-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.locale-button {
	padding: 6px;
	background: var(--report-control);
	color: inherit;
	border: 1px solid var(--report-border-strong);
	border-radius: 6px;
	cursor: pointer;
}
.locale-button:hover { border-color: var(--report-focus); }
.locale-button.active { background: var(--report-purple); border-color: var(--report-active-outline); }
.search-row { display: grid; gap: 5px; font-size: .82rem; }
.search-row input {
	box-sizing: border-box;
	width: 100%;
	padding: 7px;
	background: var(--report-panel-muted);
	color: inherit;
	border: 1px solid var(--report-border-strong);
}
.filter-summary { margin: 0; font-size: .78rem; color: var(--report-text-muted); }
.filter-button {
	width: 100%;
	padding: 7px 8px;
	background: var(--report-control);
	color: inherit;
	border: 1px solid var(--report-border-strong);
	border-radius: 6px;
	cursor: pointer;
	text-align: left;
	transition: transform .12s, border-color .12s, background .12s;
}
.filter-button:hover { transform: translateX(2px); border-color: var(--report-focus); }
.filter-button.active { border-color: var(--report-active-outline); box-shadow: 0 0 0 2px var(--report-active-shadow); }
.filter-button.active[data-change-filter=""], .filter-button.active[data-quality-filter=""] { background: var(--report-purple); }
.filter-button.active[data-change-filter="changed"], .filter-button.active[data-change-filter="new"] { background: var(--report-warning); }
.filter-button.active[data-quality-filter="unmet"] { background: var(--report-danger); }
.filter-button.active[data-quality-filter="met"] { background: var(--report-success); }
.filter-button.active[data-quality-filter="missing"],
.filter-button.active[data-change-filter="unchanged"],
.filter-button.active[data-parameter-filter=""] {
	background: var(--report-neutral);
}
.filter-button.active[data-parameter-filter="explicit"] { background: var(--report-explicit); }
.filter-button.active[data-parameter-filter="auto"] { background: var(--report-auto); }
.case { border: 1px solid var(--report-border); border-radius: 8px; padding: 16px; margin: 0 0 16px; }
.case.target-unmet { border-color: var(--report-danger-border); }
.case h2 { margin-top: 0; }
.case-metrics { font-size: .62rem; font-weight: 400; color: var(--report-text-muted); white-space: nowrap; }
.target-failures { margin: -6px 0 12px; color: var(--report-danger-text); }
.detail-link {
	display: inline-block;
	padding: 8px 12px;
	border: 1px solid var(--report-border-strong);
	border-radius: 6px;
	background: var(--report-control);
	text-decoration: none;
}
.detail-link:hover { border-color: var(--report-focus); background: var(--report-hover); }
.badge { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: .75em; background: var(--report-badge); }
.badge.failed, .badge.target-unmet { background: var(--report-danger); }
.badge.passed, .badge.target-met { background: var(--report-success); }
.badge.target-missing, .badge.unchanged { background: var(--report-neutral); }
.badge.changed, .badge.new { background: var(--report-warning); }
.badge.parameter-auto { background: var(--report-auto); }
.badge.parameter-explicit { background: var(--report-explicit); }
.badge.has-warnings { background: var(--report-orange); }
.badge.has-candidate-selection { background: var(--report-cyan); }
.images { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.images figure { margin: 0; }
.image-size { color: var(--report-text-muted); font-weight: 400; }
.image-size.size-mismatch { color: var(--report-danger-text); font-weight: 700; }
.image-stage { display: flex; align-items: center; justify-content: center; width: 100%; height: 220px; }
.image-stage img {
	display: block;
	max-width: 100%;
	max-height: 100%;
	cursor: zoom-in;
	image-rendering: pixelated;
	background: repeating-conic-gradient(#777 0 25%, #aaa 0 50%) 50% / 16px 16px;
}
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 7px; text-align: right; border-bottom: 1px solid var(--report-border); }
th:first-child { text-align: left; }
tr.metric-regressed { color: var(--report-danger-text); }
tr.metric-improved { color: var(--report-success-text); }
details { margin-top: 16px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; }
dd { margin: 0; overflow-wrap: anywhere; }
code { font-size: .8em; }
dialog { width: min(90vw, 1000px); color: var(--report-text); background: var(--report-bg); border: 1px solid var(--report-border-strong); }
.dialog-stage { height: 85vh; }
.dialog-stage img { display: block; image-rendering: pixelated; background: repeating-conic-gradient(#777 0 25%, #aaa 0 50%) 50% / 16px 16px; }
@media (max-width: 800px) {
	body { padding: 12px; }
	.report-layout { grid-template-columns: 1fr; grid-template-areas: "sidebar" "main"; }
	.sidebar { position: static; max-height: none; overflow: visible; }
	.filter-row { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
	.filter-button:hover { transform: translateY(-1px); }
}
`;

export const DETAIL_REPORT_STYLES = `${REPORT_THEME_STYLES}
body { margin: 0 auto; max-width: 1500px; padding: 24px; }
.back-link {
	display: inline-block;
	margin-bottom: 16px;
	padding: 9px 13px;
	border: 1px solid var(--report-border-strong);
	border-radius: 6px;
	background: var(--report-control);
	color: var(--report-text);
	text-decoration: none;
	transition: border-color .12s, background .12s, transform .12s;
}
.back-link:hover { border-color: var(--report-focus); background: var(--report-hover); transform: translateX(-2px); }
.back-link:focus-visible { outline: 2px solid var(--report-focus); outline-offset: 2px; }
.badge, .tag { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: .75em; background: var(--report-badge); }
.badge.failed, .badge.target-unmet { background: var(--report-danger); }
.badge.passed, .badge.target-met, .badge.candidate-recommended { background: var(--report-success); }
.badge.target-missing, .badge.unchanged { background: var(--report-neutral); }
.badge.changed, .badge.new { background: var(--report-warning); }
.badge.parameter-auto { background: var(--report-auto); }
.badge.parameter-explicit { background: var(--report-explicit); }
.images { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.images figure { margin: 0; }
.image-size { color: var(--report-text-muted); font-weight: 400; }
.image-size.size-mismatch { color: var(--report-danger-text); font-weight: 700; }
.image-stage { display: flex; align-items: center; justify-content: center; width: 100%; height: 280px; }
.image-stage img {
	display: block;
	max-width: 100%;
	max-height: 100%;
	cursor: zoom-in;
	image-rendering: pixelated;
	background: repeating-conic-gradient(#777 0 25%, #aaa 0 50%) 50% / 16px 16px;
}
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 8px; text-align: right; border-bottom: 1px solid var(--report-border); }
th:first-child { text-align: left; }
tr.metric-regressed { color: var(--report-danger-text); }
tr.metric-improved { color: var(--report-success-text); }
section { margin-top: 28px; }
.warning-details, .candidate-diagnostics { padding: 12px; border: 1px solid var(--report-border); border-radius: 8px; }
.warning-details h2, .candidate-diagnostics h2 { margin-top: 0; }
.warning-list { display: grid; gap: 10px; margin: 0; padding-left: 20px; }
.warning-item { line-height: 1.6; }
.warning-message { display: block; }
.warning-trigger { display: block; color: var(--report-text-muted); font-size: .85em; }
.candidate-options { margin-top: 12px; }
.candidate-options figcaption { line-height: 1.5; }
.candidate-metadata { display: block; color: var(--report-text-muted); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 12px; }
dd { margin: 0; overflow-wrap: anywhere; }
code { font-size: .8em; }
dialog { width: min(90vw, 1000px); color: var(--report-text); background: var(--report-bg); border: 1px solid var(--report-border-strong); }
.dialog-stage { height: 85vh; }
.dialog-stage img { display: block; image-rendering: pixelated; background: repeating-conic-gradient(#777 0 25%, #aaa 0 50%) 50% / 16px 16px; }
`;
