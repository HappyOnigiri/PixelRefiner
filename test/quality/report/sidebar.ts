import type { QualityMetadata, QualityResults } from "../types";
import { renderThemeToggle } from "./client-script";
import { escapeHtml } from "./format";

const formatGeneratedAt = (value: string): string => {
	const generatedAt = new Date(value);
	if (Number.isNaN(generatedAt.getTime())) return value;
	// [Intended] レポートを開く環境のタイムゾーンに左右されず、常に JST で表示する。
	const jst = new Date(generatedAt.getTime() + 9 * 60 * 60 * 1000);
	const pad = (part: number): string => String(part).padStart(2, "0");
	return (
		`${String(jst.getUTCFullYear())}-${pad(jst.getUTCMonth() + 1)}-` +
		`${pad(jst.getUTCDate())} ${pad(jst.getUTCHours())}:` +
		`${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())} JST`
	);
};

const renderReportMeta = (
	metadata: QualityMetadata,
	previousRunAvailable: boolean,
): string => {
	const repositoryUrl = escapeHtml(metadata.repositoryUrl);
	const commitUrl = (commit: string): string =>
		`${repositoryUrl}/commit/${encodeURIComponent(commit)}`;
	const shortCommit = (commit: string): string =>
		escapeHtml(commit.slice(0, 7));
	const generatedAt = `<dt data-i18n="generatedAt">Generated</dt>
			<dd><time datetime="${escapeHtml(metadata.generatedAt)}">${escapeHtml(formatGeneratedAt(metadata.generatedAt))}</time></dd>`;
	const workflow = `<dt data-i18n="workflow">Workflow</dt>
			<dd><a href="${escapeHtml(metadata.workflowRunUrl)}" data-i18n="workflow">workflow</a></dd>`;
	const headCommit = `<dt data-i18n="headCommit">Head</dt>
			<dd><a href="${commitUrl(metadata.headCommit)}"
				title="${escapeHtml(metadata.headCommit)}"><code>${shortCommit(metadata.headCommit)}</code></a></dd>`;
	// [Intended] 前回生成が無いレポートは、比較の欄が消えた理由を読めるようにする。
	// 欄を黙って落とすと、比較できなかったのか差が無かったのか区別が付かない。
	const previousRunNote = previousRunAvailable
		? ""
		: `<p class="previous-run-note" data-i18n="previousRunUnavailable">
		The previous run is unavailable, so comparisons with it are omitted.</p>`;
	const meta = (titleKey: string, title: string, rows: string): string =>
		`<section class="report-meta" aria-labelledby="report-meta-title">
		<h2 id="report-meta-title" data-i18n="${titleKey}">${title}</h2>
		<dl>${rows}</dl>
		${previousRunNote}
	</section>`;
	if (metadata.kind === "local")
		return meta("localReport", "Viewing locally", generatedAt);
	if (metadata.kind === "release") {
		const tag = metadata.previousVersion;
		const previousVersion =
			tag === null
				? ""
				: `<dt data-i18n="previousVersion">Previous version</dt>
			<dd><a href="${repositoryUrl}/releases/tag/${encodeURIComponent(tag)}"
				><code>${escapeHtml(tag)}</code></a></dd>`;
		return meta(
			"releaseReport",
			"Release report",
			`${headCommit}
			${previousVersion}
			${generatedAt}
			${workflow}`,
		);
	}
	return meta(
		"reportDetails",
		"Report details",
		`<dt data-i18n="pullRequest">Pull request</dt>
			<dd><a href="${repositoryUrl}/pull/${encodeURIComponent(metadata.prNumber)}">#${escapeHtml(metadata.prNumber)}</a></dd>
			${headCommit}
			<dt data-i18n="baseCommit">PR base</dt>
			<dd><a href="${commitUrl(metadata.baseCommit)}"
				title="${escapeHtml(metadata.baseCommit)}"><code>${shortCommit(metadata.baseCommit)}</code></a></dd>
			<dt data-i18n="baselineCommit">Baseline snapshot</dt>
			<dd><a href="${commitUrl(metadata.baselineCommit)}"
				title="${escapeHtml(metadata.baselineCommit)}"><code>${shortCommit(metadata.baselineCommit)}</code></a></dd>
			${generatedAt}
			${workflow}`,
	);
};

/** 前回生成との比較に関する絞り込み。前回生成が無いレポートでは丸ごと省く。 */
const renderChangeFilter = (results: QualityResults): string =>
	`<fieldset class="filter-group">
			<legend data-i18n="changeStatus">Change from previous run</legend>
			<div class="filter-row">
				<button class="filter-button active" type="button" data-change-filter="" aria-pressed="true">
					<span data-i18n="allChanges">All</span>: ${results.summary.caseCount}
				</button>
				<button class="filter-button" type="button" data-change-filter="changed" aria-pressed="false">
					<span data-i18n="changed">changed</span>: ${results.summary.changed}
				</button>
				<button class="filter-button" type="button" data-change-filter="unchanged" aria-pressed="false">
					<span data-i18n="unchanged">unchanged</span>: ${results.summary.unchanged}
				</button>
				<button class="filter-button" type="button" data-change-filter="new" aria-pressed="false">
					<span data-i18n="new">new</span>: ${results.summary.newCases}
				</button>
			</div>
		</fieldset>`;

export const renderReportSidebar = (
	results: QualityResults,
	previousRunAvailable: boolean,
): string => {
	const changeFilter = previousRunAvailable ? renderChangeFilter(results) : "";
	// [Intended] 絞り込みの説明は表示中の軸だけを並べる。前回生成が無いレポートで
	// 変化の軸を残すと、常に空のラベルが区切り記号だけを伴って出る。
	const changeLabel = previousRunAvailable
		? `<strong id="active-change-label"></strong> &times;\n\t\t\t`
		: "";
	return `<aside class="sidebar">
	<h1 data-i18n="title">PixelRefiner quality report</h1>
	<div class="report-overview">
		<p><span data-i18n="targetUnmet">Target unmet</span>: <strong>${results.summary.targetUnmet}</strong></p>
		<p><span data-i18n="targetMissing">Cannot assess</span>: <strong>${results.summary.targetMissing}</strong></p>
	</div>
	${renderReportMeta(results.metadata, previousRunAvailable)}
	<div class="filter-panel">
		<fieldset class="filter-group">
			<legend data-i18n="qualityStatus">Target quality</legend>
			<div class="filter-row">
				<button class="filter-button active" type="button" data-quality-filter="" aria-pressed="true">
					<span data-i18n="allStatuses">All</span>: ${results.summary.caseCount}
				</button>
				<button class="filter-button" type="button" data-quality-filter="unmet" aria-pressed="false">
					<span data-i18n="targetUnmet">Target unmet</span>: ${results.summary.targetUnmet}
				</button>
				<button class="filter-button" type="button" data-quality-filter="met" aria-pressed="false">
					<span data-i18n="targetMet">Target met</span>: ${results.summary.targetMet}
				</button>
				<button class="filter-button" type="button" data-quality-filter="missing" aria-pressed="false">
					<span data-i18n="targetMissing">Cannot assess</span>: ${results.summary.targetMissing}
				</button>
			</div>
		</fieldset>
		${changeFilter}
		<fieldset class="filter-group">
			<legend data-i18n="parameterMode">Parameters</legend>
			<div class="filter-row">
				<button class="filter-button active" type="button" data-parameter-filter="" aria-pressed="true">
					<span data-i18n="allParameters">All</span>
				</button>
				<button class="filter-button" type="button" data-parameter-filter="explicit" aria-pressed="false">
					<span data-i18n="explicitParameters">explicit options</span>: ${results.summary.explicitCases}
				</button>
				<button class="filter-button" type="button" data-parameter-filter="auto" aria-pressed="false">
					<span data-i18n="autoParameters">auto detection</span>: ${results.summary.autoCases}
				</button>
			</div>
		</fieldset>
		<label class="search-row" for="search">
			<span data-i18n="filterCases">Filter cases</span>
			<input id="search" placeholder="Filter cases" data-i18n-placeholder="filterCases">
		</label>
		<p class="filter-summary" aria-live="polite">
			<span data-i18n="displayConditions">Showing</span>:
			<strong id="active-quality-label"></strong> &times;
			${changeLabel}<strong id="active-parameter-label"></strong> &mdash;
			<strong id="visible-count">0</strong> / ${results.summary.caseCount}
			<span data-i18n="casesShown">cases</span>
		</p>
		<fieldset class="filter-group">
			<legend data-i18n="language">Language</legend>
			<div class="locale-row">
				<button class="locale-button" type="button" data-locale="ja" aria-pressed="false">日本語</button>
				<button class="locale-button" type="button" data-locale="en" aria-pressed="false">English</button>
				<button class="locale-button" type="button" data-locale="zh-CN" aria-pressed="false">简体中文</button>
			</div>
		</fieldset>
	</div>
	${renderThemeToggle()}
</aside>`;
};
