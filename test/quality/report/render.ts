import path from "node:path";
import type { QualityCaseResult, QualityResults } from "../types";
import { runQualityReportClient } from "./client";
import { DETAIL_REPORT_STYLES, INDEX_REPORT_STYLES } from "./styles";
import { REPORT_TRANSLATIONS } from "./translations";

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const renderClientScript = (): string =>
	`window.__QUALITY_REPORT_TRANSLATIONS__=${JSON.stringify(REPORT_TRANSLATIONS)};(${runQualityReportClient.toString()})();`;

const formatMetric = (value: number | undefined): string =>
	value === undefined ? "-" : Number(value.toFixed(3)).toString();

const formatConfidence = (value: number | null): string =>
	value === null ? "-" : value.toFixed(4);

// [Policy] A case description must stand on its own: name the input characteristic,
// the processing being exercised, and what must remain unchanged. Avoid vague text
// such as "preserve the image" when adding an image test.
const describeCase = (
	result: QualityCaseResult,
): { en: string; ja: string } => {
	const options = result.options;
	if (result.id === "convert-deterministic-auto-palette") {
		return {
			en:
				"Keep the image at its original 32 x 32 pixel dimensions and preserve " +
				"fully transparent pixels while reducing its 947 opaque input colors " +
				"to an automatically selected eight-color palette with full-strength Ordered dithering.",
			ja:
				"画像を32×32ピクセルの原寸に保ち、完全透明な画素を維持したまま、" +
				"947色ある不透明な入力色をAutoで選択した8色のパレットへ減色し、" +
				"強度100%のOrderedディザリングを適用します。",
		};
	}
	if (options.reduceColorMode === "gb_pocket") {
		return {
			en: "Convert a continuous-tone image to the four-color Game Boy Pocket palette without dithering.",
			ja: "連続階調画像をディザリングなしでゲームボーイポケットの4色パレットへ変換します。",
		};
	}
	if (options.ditherMode === "floyd-steinberg") {
		return {
			en: "Convert the image to monochrome using full-strength Floyd-Steinberg dithering.",
			ja: "Floyd-Steinbergディザリングを強度100%で適用し、画像をモノクロへ変換します。",
		};
	}
	if (options.makeSquare) {
		return {
			en: "Pad the image to a square canvas without trimming or background removal.",
			ja: "画像をトリミングや背景除去なしで正方形キャンバスへ拡張します。",
		};
	}
	if (result.degradationPatterns.includes("continuous-tone")) {
		return {
			en: "Preserve a continuous-tone image without grid detection or downsampling.",
			ja: "連続階調画像をグリッド検出や縮小処理なしで保持します。",
		};
	}
	if (result.degradationPatterns.includes("pixel-art-1x")) {
		return {
			en: "Preserve native-resolution pixel art, including small disconnected components and its limited palette.",
			ja: "小さな分離パーツや少色パレットを含む等倍のドット絵をそのまま保持します。",
		};
	}
	const target =
		options.forcePixelsW !== undefined && options.forcePixelsH !== undefined
			? `${options.forcePixelsW} x ${options.forcePixelsH}`
			: null;
	if (result.degradationPatterns.length > 0) {
		const patterns = result.degradationPatterns.join(", ");
		return {
			en: `Correct ${patterns}${target ? ` and restore the image to ${target} pixels` : ""}.`,
			ja: `${patterns}の劣化を補正し${target ? `、${target}ピクセルへ復元` : ""}します。`,
		};
	}
	const stepsEn: string[] = [];
	const stepsJa: string[] = [];
	if (options.preRemoveBackground || options.postRemoveBackground) {
		stepsEn.push("remove the background");
		stepsJa.push("背景除去");
	}
	if (options.trimToContent) {
		stepsEn.push("trim transparent margins");
		stepsJa.push("透明余白のトリミング");
	}
	if (options.autoGridFromTrimmed || options.enableGridDetection !== false) {
		stepsEn.push("restore the detected pixel grid");
		stepsJa.push("検出したピクセルグリッドの復元");
	}
	if (stepsEn.length === 0) {
		return target
			? {
					en: `Resize the input image to ${target} pixels without background removal, transparent-margin trimming, or pixel-grid restoration.`,
					ja:
						"背景除去、透明余白のトリミング、ピクセルグリッド復元を行わず、" +
						`入力画像を${target}ピクセルへ変換します。`,
				}
			: {
					en: "Output the input image at its current dimensions without background removal, transparent-margin trimming, or pixel-grid restoration.",
					ja:
						"背景除去、透明余白のトリミング、ピクセルグリッド復元を行わず、" +
						"入力画像を現在の寸法のまま出力します。",
				};
	}
	return {
		en: `${stepsEn.join(", ")}${target ? `, then resize it to ${target} pixels` : ""}.`,
		ja: `${stepsJa.join("、")}${target ? `後、${target}ピクセルへ変換` : ""}します。`,
	};
};

const renderImageDialog = (): string => `
<dialog id="image-dialog">
	<button id="dialog-close">&times;</button>
	<div class="image-stage dialog-stage"><img alt=""></div>
</dialog>`;

const renderReportSidebar = (results: QualityResults): string => {
	const repositoryUrl = escapeHtml(results.metadata.repositoryUrl);
	const commitUrl = (commit: string): string =>
		`${repositoryUrl}/commit/${encodeURIComponent(commit)}`;
	const shortCommit = (commit: string): string =>
		escapeHtml(commit.slice(0, 7));
	const verdictKey =
		results.summary.blockingFailures > 0 ? "hasRegression" : "noRegression";
	return `<aside class="sidebar">
	<h1 data-i18n="title">PixelRefiner quality report</h1>
	<p class="verdict" data-i18n="${verdictKey}">${verdictKey}</p>
	<section class="report-meta" aria-labelledby="report-meta-title">
		<h2 id="report-meta-title" data-i18n="reportDetails">Report details</h2>
		<dl>
			<dt data-i18n="pullRequest">Pull request</dt>
			<dd><a href="${repositoryUrl}/pull/${encodeURIComponent(results.metadata.prNumber)}">#${escapeHtml(results.metadata.prNumber)}</a></dd>
			<dt data-i18n="headCommit">Head</dt>
			<dd><a href="${commitUrl(results.metadata.headCommit)}"
				title="${escapeHtml(results.metadata.headCommit)}"><code>${shortCommit(results.metadata.headCommit)}</code></a></dd>
			<dt data-i18n="baseCommit">PR base</dt>
			<dd><a href="${commitUrl(results.metadata.baseCommit)}"
				title="${escapeHtml(results.metadata.baseCommit)}"><code>${shortCommit(results.metadata.baseCommit)}</code></a></dd>
			<dt data-i18n="baselineCommit">Baseline snapshot</dt>
			<dd><a href="${commitUrl(results.metadata.baselineCommit)}"
				title="${escapeHtml(results.metadata.baselineCommit)}"><code>${shortCommit(results.metadata.baselineCommit)}</code></a></dd>
			<dt data-i18n="generatedAt">Generated</dt>
			<dd><time datetime="${escapeHtml(results.metadata.generatedAt)}">${escapeHtml(results.metadata.generatedAt)}</time></dd>
			<dt data-i18n="workflow">Workflow</dt>
			<dd><a href="${escapeHtml(results.metadata.workflowRunUrl)}" data-i18n="workflow">workflow</a></dd>
		</dl>
	</section>
	<div class="filter-panel">
		<fieldset class="filter-group">
			<legend data-i18n="language">Language</legend>
				<div class="locale-row">
					<button class="locale-button" type="button" data-locale="ja" aria-pressed="false">日本語</button>
					<button class="locale-button" type="button" data-locale="en" aria-pressed="false">English</button>
					<button class="locale-button" type="button" data-locale="zh-CN" aria-pressed="false">简体中文</button>
				</div>
		</fieldset>
		<fieldset class="filter-group">
			<legend data-i18n="changeStatus">Change status</legend>
			<div class="filter-row">
				<button class="filter-button active" type="button" data-change-filter="" aria-pressed="true">
					<span data-i18n="allChanges">All</span>: ${results.summary.caseCount}
				</button>
				<button class="filter-button" type="button" data-change-filter="changed" aria-pressed="false">
					<span data-i18n="changed">changed</span>: ${results.summary.changed}
				</button>
				<button class="filter-button" type="button" data-change-filter="regressed" aria-pressed="false">
					<span data-i18n="regressed">regressed</span>: ${results.summary.regressed}
				</button>
				<button class="filter-button" type="button" data-change-filter="improved" aria-pressed="false">
					<span data-i18n="improved">improved</span>: ${results.summary.improved}
				</button>
				<button class="filter-button" type="button" data-change-filter="unchanged" aria-pressed="false">
					<span data-i18n="unchanged">unchanged</span>: ${results.summary.unchanged}
				</button>
			</div>
		</fieldset>
		<fieldset class="filter-group">
			<legend data-i18n="qualityStatus">Quality status</legend>
			<div class="filter-row">
				<button class="filter-button active" type="button" data-status-filter="" aria-pressed="true"><span data-i18n="allStatuses">All</span></button>
				<button class="filter-button" type="button" data-status-filter="passed" aria-pressed="false">
					<span data-i18n="passed">passed</span>: ${results.summary.passed}
				</button>
				<button class="filter-button" type="button" data-status-filter="failed" aria-pressed="false">
					<span data-i18n="failed">target unmet</span>: ${results.summary.failed}
				</button>
			</div>
		</fieldset>
		<label class="search-row" for="search">
			<span data-i18n="filterCases">Filter cases</span>
			<input id="search" placeholder="Filter cases" data-i18n-placeholder="filterCases">
		</label>
		<p class="filter-summary" aria-live="polite">
			<span data-i18n="displayConditions">Showing</span>:
			<strong id="active-change-label"></strong> &times;
			<strong id="active-status-label"></strong> &mdash;
			<strong id="visible-count">0</strong> / ${results.summary.caseCount}
			<span data-i18n="casesShown">cases</span>
		</p>
	</div>
</aside>`;
};

export const renderHtml = (results: QualityResults): string => {
	const changeOrder = {
		regressed: 0,
		new: 1,
		changed: 2,
		improved: 3,
		unchanged: 4,
	};
	const sortedCases = [...results.cases].sort(
		(left, right) =>
			changeOrder[left.changeStatus] - changeOrder[right.changeStatus],
	);
	const cards = sortedCases
		.map((result) => {
			const description = describeCase(result);
			const exactMatch = !result.failedAssertions.includes("exact-image-match");
			const errorTarget = result.expectation.exact
				? "0"
				: `&le;${formatMetric(result.expectation.maxMeanRgbaError)}`;
			const exactMeasurement = result.expectation.exact
				? '<strong data-i18n="exactMatchShort">Exact</strong> ' +
					`<span data-i18n="${exactMatch ? "yes" : "no"}">` +
					`${exactMatch ? "yes" : "no"}</span> &middot; `
				: "";
			const qualityMeasurement = [
				'<small class="case-metrics">',
				exactMeasurement,
				'<strong data-i18n="meanRgbaErrorShort">Error</strong> ',
				`${formatMetric(result.metrics.meanRgbaError)}/${errorTarget}`,
				' &middot; <strong data-i18n="processingTime">Time</strong> ',
				`${result.metrics.runtimeMs.toFixed(2)}ms`,
				' &middot; <strong data-i18n="confidence">Confidence (diagnostic)</strong> ',
				`${formatConfidence(result.confidence)}</small>`,
			].join("");
			const searchable = [
				result.id,
				...result.featureIds,
				result.status,
				result.changeStatus,
				result.inputKind,
				result.route,
				description.en,
				description.ja,
				...result.warnings,
				...result.degradationPatterns,
			].join(" ");
			const renderImages = (
				images: Array<[string, string, string | null]>,
			): string =>
				images
					.filter(
						(image): image is [string, string, string] => image[2] !== null,
					)
					.map(
						([key, label, source]) =>
							`<figure><figcaption data-i18n="${key}">${label}</figcaption>` +
							`<div class="image-stage"><img src="${escapeHtml(source)}" alt="${label}" ` +
							`data-i18n-alt="${key}" loading="lazy"></div></figure>`,
					)
					.join("");
			const primaryImages = renderImages([
				["input", "Input", result.files.input],
				["result", "Result", result.files.result],
			]);
			return `<article class="case ${result.status} ${result.changeStatus}"
			data-status="${result.status}" data-change="${result.changeStatus}" data-search="${escapeHtml(searchable)}">
			<h2>
				${escapeHtml(result.id)}
				<span class="badge ${result.status}" data-i18n="${result.status}">${result.status}</span>
				<span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span>
				${qualityMeasurement}
			</h2>
			<p class="case-description" data-description-en="${escapeHtml(description.en)}"
				data-description-ja="${escapeHtml(description.ja)}">${escapeHtml(description.en)}</p>
			<div class="images primary">${primaryImages}</div><p><a class="detail-link"
				href="${escapeHtml(path.posix.dirname(result.files.result))}/index.html" data-i18n="details">Details</a></p>
		</article>`;
		})
		.join("\n");
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width">
	<title data-i18n="title">PixelRefiner quality report</title>
	<style>
${INDEX_REPORT_STYLES}	</style>
</head>
<body>
	<div class="report-layout">
${renderReportSidebar(results)}
		<main class="report-main">${cards}</main>
	</div>
${renderImageDialog()}
	<script>${renderClientScript()}</script>
</body>
</html>`;
};

export const renderCaseDetailHtml = (result: QualityCaseResult): string => {
	const description = describeCase(result);
	const renderImages = (
		images: Array<[string, string, string | null]>,
	): string =>
		images
			.filter((image): image is [string, string, string] => image[2] !== null)
			.map(([key, label, source]) => {
				const fileName = escapeHtml(path.posix.basename(source));
				return (
					`<figure><figcaption data-i18n="${key}">${label}</figcaption>` +
					`<div class="image-stage"><img src="${fileName}" alt="${label}" ` +
					`data-i18n-alt="${key}" loading="lazy"></div></figure>`
				);
			})
			.join("");
	const allImages = renderImages([
		["input", "Input", result.files.input],
		["groundTruth", "Ground truth", result.files.groundTruth],
		["baseline", "Baseline", result.files.baseline],
		["result", "Result", result.files.result],
		["groundTruthDifference", "Ground-truth difference", result.files.diff],
		["baselineDifference", "Baseline difference", result.files.baselineDiff],
		["backgroundMask", "Background mask", result.files.backgroundMask],
	]);
	const warnings =
		result.warnings.length === 0
			? '<span data-i18n="none">none</span>'
			: result.warnings
					.map(
						(warning) =>
							`<span data-i18n="assertions.${escapeHtml(warning)}">${escapeHtml(warning)}</span>`,
					)
					.join(", ");
	const metricState = (key: string): string => {
		if (result.regressedMetrics.includes(key)) return "regressed";
		if (result.improvedMetrics.includes(key)) return "improved";
		return "unchanged";
	};
	const metricRow = (
		key: string,
		current: number,
		baseline: number | undefined,
		target: string,
	): string => {
		const delta = baseline === undefined ? undefined : current - baseline;
		const deltaText =
			delta === undefined
				? "-"
				: `${delta > 0 ? "+" : ""}${formatMetric(delta)}`;
		const state = metricState(key);
		return `<tr class="${state}">
			<th data-i18n="${key}">${key}</th>
			<td>${escapeHtml(target)}</td>
			<td>${formatMetric(baseline)}</td>
			<td>${formatMetric(current)}</td>
			<td>${deltaText}</td>
			<td data-i18n="${state}">${state}</td>
		</tr>`;
	};
	const baselineMetrics = result.baselineMetrics;
	const expectedSize =
		result.expectation.expectedWidth !== undefined &&
		result.expectation.expectedHeight !== undefined
			? `${result.expectation.expectedWidth}x${result.expectation.expectedHeight}`
			: "correct";
	const sizeState = result.metrics.sizeCorrect ? "passed" : "failed";
	const sizeRow = `<tr class="${sizeState}">
		<th data-i18n="outputSize">Output size</th>
		<td>${expectedSize}</td>
		<td>${baselineMetrics ? `${baselineMetrics.outputWidth}x${baselineMetrics.outputHeight}` : "-"}</td>
		<td>${result.metrics.outputWidth}x${result.metrics.outputHeight}</td>
		<td>-</td>
		<td data-i18n="${sizeState}">${sizeState}</td>
	</tr>`;
	const metricRows = [
		sizeRow,
		metricRow(
			"meanRgbaError",
			result.metrics.meanRgbaError,
			baselineMetrics?.meanRgbaError,
			result.expectation.maxMeanRgbaError === undefined
				? "-"
				: `<= ${result.expectation.maxMeanRgbaError}`,
		),
		metricRow(
			"edgeF1",
			result.metrics.edgeF1,
			baselineMetrics?.edgeF1,
			result.expectation.minEdgeF1 === undefined
				? "-"
				: `>= ${result.expectation.minEdgeF1}`,
		),
		metricRow(
			"backgroundMaskIou",
			result.metrics.backgroundMaskIou,
			baselineMetrics?.backgroundMaskIou,
			result.expectation.minBackgroundMaskIou === undefined
				? "-"
				: `>= ${result.expectation.minBackgroundMaskIou}`,
		),
		metricRow(
			"smallComponentRetention",
			result.metrics.smallComponentRetention,
			baselineMetrics?.smallComponentRetention,
			result.expectation.minSmallComponentRetention === undefined
				? "-"
				: `>= ${result.expectation.minSmallComponentRetention}`,
		),
	].join("\n");
	const changedPixels =
		result.changedPixelCount === null
			? "-"
			: `${result.changedPixelCount} (${((result.changedPixelRate ?? 0) * 100).toFixed(2)}%)`;
	const tags = result.degradationPatterns
		.map((pattern) => `<span class="tag">${escapeHtml(pattern)}</span>`)
		.join(" ");
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width">
	<title>${escapeHtml(result.id)} - PixelRefiner quality report</title>
	<style>
${DETAIL_REPORT_STYLES}	</style>
</head>
<body>
	<a class="back-link" href="../../index.html" data-i18n="backToReport">Back to report</a>
	<main>
		<h1>
			${escapeHtml(result.id)}
			<span class="badge ${result.status}" data-i18n="${result.status}">${result.status}</span>
			<span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span>
		</h1>
		<p class="case-description" data-description-en="${escapeHtml(description.en)}"
			data-description-ja="${escapeHtml(description.ja)}">${escapeHtml(description.en)}</p>
		<p>${tags}</p>
		<p><strong data-i18n="changedPixels">Changed pixels</strong>: ${changedPixels}</p>
		<section>
			<h2 data-i18n="diagnostics">All images and settings</h2>
			<div class="images">${allImages}</div>
		</section>
		<section>
			<h2 data-i18n="comparison">Metric comparison</h2>
			<div class="table-scroll">
				<table>
					<thead>
						<tr>
							<th data-i18n="metric">Metric</th>
							<th data-i18n="target">Target</th>
							<th data-i18n="baseline">Baseline</th>
							<th data-i18n="current">Current</th>
							<th data-i18n="delta">Delta</th>
							<th data-i18n="verdict">Verdict</th>
						</tr>
					</thead>
					<tbody>${metricRows}</tbody>
				</table>
			</div>
		</section>
		<section>
			<h2 data-i18n="options">Options</h2>
			<dl>
				<dt data-i18n="inputKind">Input kind</dt><dd>${escapeHtml(result.inputKind)}</dd>
				<dt data-i18n="route">Route</dt><dd data-i18n="${result.route}">${result.route}</dd>
				<dt data-i18n="confidence">Confidence (diagnostic)</dt><dd>${formatConfidence(result.confidence)}</dd>
				<dt data-i18n="warnings">Warnings</dt><dd>${warnings}</dd>
				<dt data-i18n="topCandidates">Top candidates</dt><dd><code>${escapeHtml(JSON.stringify(result.gridCandidates))}</code></dd>
				<dt data-i18n="metrics">Metrics</dt><dd><code>${escapeHtml(JSON.stringify(result.metrics))}</code></dd>
				<dt data-i18n="options">Options</dt><dd><code>${escapeHtml(JSON.stringify(result.options))}</code></dd>
			</dl>
		</section>
	</main>
${renderImageDialog()}
	<script>${renderClientScript()}</script>
</body>
</html>`;
};

export const renderMarkdown = (results: QualityResults): string => {
	const summary = results.summary;
	const rows = results.cases
		.map((result) =>
			[
				`|${result.id}`,
				`|${result.status}`,
				`|${result.metrics.outputWidth}x${result.metrics.outputHeight}`,
				`|${formatConfidence(result.confidence)}`,
				`|${result.metrics.meanRgbaError.toFixed(3)}`,
				`|${result.metrics.edgeF1.toFixed(3)}`,
				`|${result.metrics.runtimeMs.toFixed(2)}|`,
			].join(""),
		)
		.join("\n");
	return `# PixelRefiner quality report

- Cases: ${summary.caseCount}
- Passed: ${summary.passed}
- Failed: ${summary.failed}
- Changed: ${summary.changed}
- Regressed: ${summary.regressed}
- Improved: ${summary.improved}
- Top-1 size accuracy: ${(summary.top1SizeAccuracy * 100).toFixed(1)}%
- Top-3 size accuracy: ${(summary.top3SizeAccuracy * 100).toFixed(1)}%
- Catastrophic failure rate: ${(summary.catastrophicFailureRate * 100).toFixed(
		1,
	)}%

|Case|Status|Output|Confidence (diagnostic)|Mean RGBA error|Edge F1|Runtime (ms)|
|---|---|---:|---:|---:|---:|---:|
${rows}
`;
};
