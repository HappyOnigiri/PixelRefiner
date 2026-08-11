export const INDEX_REPORT_STYLES = `
:root { color-scheme: dark; font-family: system-ui, sans-serif; background: #15131a; color: #f4efff; }
body { margin: 0 auto; max-width: 1800px; padding: 20px; }
a { color: #b9a7ff; }
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
	border: 1px solid #494151;
	border-radius: 10px;
	background: #1d1923;
}
.report-main { grid-area: main; }
.sidebar h1 { margin: 0; font-size: 1.2rem; }
.report-overview { display: grid; gap: 4px; }
.report-overview p { margin: 0; font-size: .88rem; }
.report-meta h2 { margin: 0 0 6px; font-size: .85rem; color: #d6cce4; }
.report-meta dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 8px; margin: 0; font-size: .78rem; }
.report-meta dt { color: #aaa0b8; }
.report-meta dd { margin: 0; overflow-wrap: anywhere; }
.report-meta code { font-size: inherit; }
.filter-panel { display: grid; gap: 10px; }
.filter-group { margin: 0; padding: 8px; border: 1px solid #494151; border-radius: 8px; background: #25212d; }
.filter-group legend { padding: 0 4px; font-size: .82rem; font-weight: 700; }
.filter-row { display: grid; gap: 5px; }
.locale-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.locale-button { padding: 6px; background: #302a39; color: inherit; border: 1px solid #635a70; border-radius: 6px; cursor: pointer; }
.locale-button:hover { border-color: #c2b4ff; }
.locale-button.active { background: #59458a; border-color: #fff; }
.search-row { display: grid; gap: 5px; font-size: .82rem; }
.search-row input { box-sizing: border-box; width: 100%; padding: 7px; background: #25212d; color: inherit; border: 1px solid #635a70; }
.filter-summary { margin: 0; font-size: .78rem; color: #d6cce4; }
.filter-button {
	width: 100%;
	padding: 7px 8px;
	background: #302a39;
	color: inherit;
	border: 1px solid #635a70;
	border-radius: 6px;
	cursor: pointer;
	text-align: left;
	transition: transform .12s, border-color .12s, background .12s;
}
.filter-button:hover { transform: translateX(2px); border-color: #c2b4ff; }
.filter-button.active { border-color: #fff; box-shadow: 0 0 0 2px #ffffff22; }
.filter-button.active[data-change-filter=""] { background: #59458a; }
.filter-button.active[data-change-filter="changed"] { background: #725b20; }
.filter-button.active[data-quality-filter=""] { background: #59458a; }
.filter-button.active[data-quality-filter="unmet"] { background: #7a2930; }
.filter-button.active[data-quality-filter="met"] { background: #236044; }
.filter-button.active[data-quality-filter="missing"], .filter-button.active[data-change-filter="unchanged"] { background: #48536b; }
.filter-button.active[data-change-filter="new"] { background: #725b20; }
.filter-button.active[data-parameter-filter=""] { background: #48536b; }
.filter-button.active[data-parameter-filter="explicit"] { background: #3d3550; }
.filter-button.active[data-parameter-filter="auto"] { background: #2d4a6b; }
.case { border: 1px solid #494151; border-radius: 8px; padding: 16px; margin: 0 0 16px; }
.case.target-unmet { border-color: #ff6b6b; }
.case h2 { margin-top: 0; }
.case-metrics { font-size: .62rem; font-weight: 400; color: #bdb3c9; white-space: nowrap; }
.target-failures { margin: -6px 0 12px; color: #ffb0b0; }
.detail-link { display: inline-block; padding: 8px 12px; border: 1px solid #635a70; border-radius: 6px; background: #302a39; text-decoration: none; }
.detail-link:hover { border-color: #c2b4ff; background: #3b3346; }
.badge { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: .75em; background: #393241; }
.badge.failed, .badge.target-unmet { background: #7a2930; }
.badge.passed, .badge.target-met { background: #236044; }
.badge.target-missing { background: #48536b; }
.badge.changed, .badge.new { background: #725b20; }
.badge.unchanged { background: #48536b; }
.badge.parameter-auto { background: #2d4a6b; }
.badge.parameter-explicit { background: #3d3550; }
.badge.has-warnings { background: #8a4b16; }
.badge.has-candidate-selection { background: #1f5f6b; }
.images { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.images figure { margin: 0; }
.image-size { color: #d6cce4; font-weight: 400; }
.image-size.size-mismatch { color: #ff8f8f; font-weight: 700; }
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
th, td { padding: 7px; text-align: right; border-bottom: 1px solid #494151; }
th:first-child { text-align: left; }
tr.metric-regressed { color: #ff8f8f; }
tr.metric-improved { color: #85e6a9; }
details { margin-top: 16px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; }
dd { margin: 0; overflow-wrap: anywhere; }
code { font-size: .8em; }
dialog { width: min(90vw, 1000px); background: #15131a; border: 1px solid #635a70; }
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

export const DETAIL_REPORT_STYLES = `
:root { color-scheme: dark; font-family: system-ui, sans-serif; background: #15131a; color: #f4efff; }
body { margin: 0 auto; max-width: 1500px; padding: 24px; }
a { color: #b9a7ff; }
.back-link {
	display: inline-block;
	margin-bottom: 16px;
	padding: 9px 13px;
	border: 1px solid #635a70;
	border-radius: 6px;
	background: #302a39;
	color: #f4efff;
	text-decoration: none;
	transition: border-color .12s, background .12s, transform .12s;
}
.back-link:hover { border-color: #c2b4ff; background: #3b3346; transform: translateX(-2px); }
.back-link:focus-visible { outline: 2px solid #c2b4ff; outline-offset: 2px; }
.badge, .tag { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: .75em; background: #393241; }
.badge.failed, .badge.target-unmet { background: #7a2930; }
.badge.passed, .badge.target-met { background: #236044; }
.badge.target-missing { background: #48536b; }
.badge.changed, .badge.new { background: #725b20; }
.badge.unchanged { background: #48536b; }
.badge.parameter-auto { background: #2d4a6b; }
.badge.parameter-explicit { background: #3d3550; }
.images { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.images figure { margin: 0; }
.image-size { color: #d6cce4; font-weight: 400; }
.image-size.size-mismatch { color: #ff8f8f; font-weight: 700; }
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
th, td { padding: 8px; text-align: right; border-bottom: 1px solid #494151; }
th:first-child { text-align: left; }
tr.metric-regressed { color: #ff8f8f; }
tr.metric-improved { color: #85e6a9; }
section { margin-top: 28px; }
.warning-details, .candidate-diagnostics { padding: 12px; border: 1px solid #494151; border-radius: 8px; }
.warning-details h2, .candidate-diagnostics h2 { margin-top: 0; }
.badge.candidate-recommended { background: #236044; }
.warning-list { display: grid; gap: 10px; margin: 0; padding-left: 20px; }
.warning-item { line-height: 1.6; }
.warning-message { display: block; }
.warning-trigger { display: block; color: #d6cce4; font-size: .85em; }
.candidate-options { margin-top: 12px; }
.candidate-options figcaption { line-height: 1.5; }
.candidate-metadata { display: block; color: #d6cce4; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 12px; }
dd { margin: 0; overflow-wrap: anywhere; }
code { font-size: .8em; }
dialog { width: min(90vw, 1000px); background: #15131a; border: 1px solid #635a70; }
.dialog-stage { height: 85vh; }
.dialog-stage img { display: block; image-rendering: pixelated; background: repeating-conic-gradient(#777 0 25%, #aaa 0 50%) 50% / 16px 16px; }
`;
