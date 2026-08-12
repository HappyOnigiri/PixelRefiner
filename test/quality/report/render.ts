import path from "node:path";
import type { QualityCaseResult, QualityResults } from "../types";
import {
	renderAutoDiagnosticBadges,
	renderCandidateDiagnostics,
	renderWarningDetails,
} from "./auto-diagnostics";
import { describeCase } from "./case-description";
import {
	renderClientScript,
	renderThemeBootstrapScript,
} from "./client-script";
import {
	escapeHtml,
	formatConfidence,
	formatImageSize,
	formatMetric,
} from "./format";
import {
	renderAllImages,
	renderImageDialog,
	renderPrimaryImages,
} from "./images";
import { hasMetricReference } from "./metric-reference";
import { hasPreviousRun } from "./previous-run";
import { renderReportSidebar } from "./sidebar";
import { DETAIL_REPORT_STYLES, INDEX_REPORT_STYLES } from "./styles";
import { renderTargetComparison, TARGET_STATE_KEYS } from "./target-section";

export const renderHtml = (results: QualityResults): string => {
	const previousRunAvailable = hasPreviousRun(results);
	const targetOrder = { unmet: 0, missing: 1, met: 2 };
	const changeOrder = {
		changed: 0,
		unchanged: 1,
		new: 2,
	};
	const sortedCases = [...results.cases].sort(
		(left, right) =>
			targetOrder[left.targetStatus] - targetOrder[right.targetStatus] ||
			changeOrder[left.changeStatus] - changeOrder[right.changeStatus],
	);
	const cards = sortedCases
		.map((result) => {
			const description = describeCase(result);
			// [Intended] 一覧の主判定は固定目標に対する品質だけにする。前回出力との比較結果を
			// 「合格」と表示すると、既知の不具合を再現したケースが良品に見えるため。
			const targetState = result.targetStatus;
			const targetMeasurement =
				`<strong data-i18n="qualityStatus">Target quality</strong> ` +
				`<span data-i18n="${TARGET_STATE_KEYS[targetState]}">${targetState}</span>` +
				(targetState === "unmet" && result.targetMetrics
					? ` ${formatMetric(result.targetMetrics.meanRgbaError)}`
					: "");
			const qualityMeasurement = [
				'<small class="case-metrics">',
				targetMeasurement,
				' &middot; <strong data-i18n="processingTime">Time</strong> ',
				`${result.metrics.runtimeMs.toFixed(2)}ms`,
				' &middot; <strong data-i18n="gridConfidence">Grid confidence</strong> ',
				`${formatConfidence(result.confidence)}</small>`,
			].join("");
			const targetFailures =
				result.targetFailedAssertions.length === 0
					? ""
					: `<p class="target-failures"><strong data-i18n="targetUnmet">Target unmet</strong>: ` +
						result.targetFailedAssertions
							.map(
								(assertion) =>
									`<span data-i18n="assertions.${escapeHtml(assertion)}">${escapeHtml(assertion)}</span>`,
							)
							.join(", ") +
						"</p>";
			// [Intended] 前回生成が無いレポートでは全ケースが "new" になるので、
			// 変化のバッジも検索語も出さない。判定できていない状態を新規ケースの
			// 表示で埋めると、前回から変わっていないケースと見分けが付かなくなる。
			const changeBadge = previousRunAvailable
				? `<span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span>`
				: "";
			const searchable = [
				result.id,
				...result.featureIds,
				result.parameterMode,
				result.targetStatus,
				...(previousRunAvailable ? [result.changeStatus] : []),
				result.inputKind,
				result.route,
				description.en,
				description.ja,
				...result.warnings,
				...result.degradationPatterns,
			].join(" ");
			const primaryImages = renderPrimaryImages(result);
			return `<article class="case target-${targetState}"
			data-quality="${targetState}"${previousRunAvailable ? ` data-change="${result.changeStatus}"` : ""}
			data-parameter="${result.parameterMode}"
			data-search="${escapeHtml(searchable)}">
			<h2>
				${escapeHtml(result.id)}
				<span class="badge target-${targetState}" data-i18n="${TARGET_STATE_KEYS[targetState]}">${targetState}</span>
				${changeBadge}
				<span class="badge parameter-${result.parameterMode}"
					data-i18n="${result.parameterMode === "auto" ? "autoParameters" : "explicitParameters"}">${result.parameterMode}</span>
				${renderAutoDiagnosticBadges(result)}
				${qualityMeasurement}
			</h2>
			${targetFailures}
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
	<script>${renderThemeBootstrapScript()}</script>
	<style>
${INDEX_REPORT_STYLES}	</style>
</head>
<body>
	<div class="report-layout">
${renderReportSidebar(results, previousRunAvailable)}
		<main class="report-main">${cards}</main>
	</div>
${renderImageDialog()}
	<script>${renderClientScript()}</script>
</body>
</html>`;
};

// [Intended] 前回生成の有無は既定値を持たせず必ず渡させる。一覧と Markdown は
// results から自分で判定するので、詳細ページだけ渡し忘れると一覧では省いた前回比較の
// 欄が詳細ページにだけ空で残る。
export const renderCaseDetailHtml = (
	result: QualityCaseResult,
	previousRunAvailable: boolean,
): string => {
	const description = describeCase(result);
	const targetStateKey = TARGET_STATE_KEYS[result.targetStatus];
	const allImages = renderAllImages(result);
	// [Intended] 基準画像を取得できなかったケースは、指標が自身の出力との比較になり
	// 誤差 0・一致率 1 が並ぶ。値をそのまま出すと完全一致と読めてしまうので伏せる。
	const metricReferenceAvailable = hasMetricReference(result);
	const metricState = (
		key: string,
		hasBaseline: boolean,
	): { className: string; translationKey: string; label: string } => {
		// [Intended] ベースライン未登録のケースは Baseline 列も Delta 列も "-" になるので、
		// 「前回基準と同じ」と断定せず判定不能として出す。
		if (!hasBaseline) {
			return {
				className: "metric-unchanged",
				translationKey: "notAvailable",
				label: "not available",
			};
		}
		if (result.regressedMetrics.includes(key)) {
			return {
				className: "metric-regressed",
				translationKey: "metricRegressed",
				label: "metric regressed",
			};
		}
		if (result.improvedMetrics.includes(key)) {
			return {
				className: "metric-improved",
				translationKey: "metricImproved",
				label: "metric improved",
			};
		}
		return {
			className: "metric-unchanged",
			translationKey: "metricUnchanged",
			label: "metric unchanged",
		};
	};
	// [Intended] 前回生成が無いレポートでは、前回基準の列と判定を出さない。空欄のまま
	// 残すと、比較できなかったのか差が無かったのかを読み分けられない。Verdict 列は
	// 出力サイズ行が期待どおりかを示すので、前回比較の判定だけを空にして列は残す。
	const comparisonCell = (value: string): string =>
		previousRunAvailable ? `<td>${value}</td>` : "";
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
		const state = metricState(key, baseline !== undefined);
		return `<tr${previousRunAvailable ? ` class="${state.className}"` : ""}>
			<th data-i18n="${key}">${key}</th>
			<td>${escapeHtml(target)}</td>
			${comparisonCell(formatMetric(baseline))}
			<td>${metricReferenceAvailable ? formatMetric(current) : "-"}</td>
			${comparisonCell(deltaText)}
			${
				previousRunAvailable
					? `<td data-i18n="${state.translationKey}">${state.label}</td>`
					: "<td></td>"
			}
		</tr>`;
	};
	const baselineMetrics = result.baselineMetrics;
	const expectedSize =
		result.expectation.expectedWidth !== undefined &&
		result.expectation.expectedHeight !== undefined
			? formatImageSize({
					width: result.expectation.expectedWidth,
					height: result.expectation.expectedHeight,
				})
			: "correct";
	// 出力サイズの判定も基準画像との一致なので、基準が無ければ判定を出さない。
	const sizeState = result.metrics.sizeCorrect ? "passed" : "failed";
	const sizeVerdictKey = metricReferenceAvailable ? sizeState : "notAvailable";
	const sizeVerdictLabel = metricReferenceAvailable
		? sizeState
		: "not available";
	const sizeRow = `<tr class="${metricReferenceAvailable ? sizeState : "metric-unchanged"}">
		<th data-i18n="outputSize">Output size</th>
		<td>${expectedSize}</td>
		${comparisonCell(
			baselineMetrics
				? formatImageSize({
						width: baselineMetrics.outputWidth,
						height: baselineMetrics.outputHeight,
					})
				: "-",
		)}
		<td>${formatImageSize({
			width: result.metrics.outputWidth,
			height: result.metrics.outputHeight,
		})}</td>
		${comparisonCell("-")}
		<td data-i18n="${sizeVerdictKey}">${sizeVerdictLabel}</td>
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
	// [Intended] 指標テーブルの行は数値指標だけなので、catastrophicFailure や status の
	// ような非数値の回帰は表に現れない。ゲートが落ちた理由をレポートから辿れるように、
	// regressedMetrics のキーを漏らさず列挙する。
	const regressedMetricsSummary =
		result.regressedMetrics.length === 0
			? '<span data-i18n="none">none</span>'
			: result.regressedMetrics
					.map(
						(key) =>
							`<span data-i18n="${escapeHtml(key)}">${escapeHtml(key)}</span>`,
					)
					.join(", ");
	const changedPixels =
		result.changedPixelCount === null
			? "-"
			: `${result.changedPixelCount} (${((result.changedPixelRate ?? 0) * 100).toFixed(2)}%)`;
	// 変化画素数と回帰した指標はどちらも前回生成との比較結果なので、前回生成が無ければ出さない。
	const previousRunSummary = previousRunAvailable
		? `<p><strong data-i18n="changedPixels">Changed pixels</strong>: ${changedPixels}</p>`
		: "";
	const regressionSummary = previousRunAvailable
		? `<p class="metric-regression-summary"><strong data-i18n="regressedMetrics">Regressed metrics</strong>: ${regressedMetricsSummary}</p>`
		: "";
	// 指標を伏せたケースでは、値が消えた理由を表の下に出す。空欄のままにすると
	// 測れなかったのか 0 だったのかを読み分けられない。
	const metricReferenceNote = metricReferenceAvailable
		? ""
		: '<p class="metric-reference-note" data-i18n="metricReferenceUnavailable">' +
			"No reference output is available for this case, so its metrics cannot be measured.</p>";
	const changeBadge = previousRunAvailable
		? `<span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span>`
		: "";
	const comparisonHeader = (key: string, label: string): string =>
		previousRunAvailable ? `<th data-i18n="${key}">${label}</th>` : "";
	const tags = result.degradationPatterns
		.map((pattern) => `<span class="tag">${escapeHtml(pattern)}</span>`)
		.join(" ");
	// [Intended] 実行時間はベースラインを持たない指標なので、指標比較の表には入れず
	// 単独の行で出す。表へ足すと Baseline も Delta も "-" のまま判定列だけが埋まり、
	// 前回基準と比べられる指標と見分けがつかなくなる。
	const processingTime =
		'<p><strong data-i18n="processingTime">Time</strong>: ' +
		`${result.metrics.runtimeMs.toFixed(2)}ms</p>`;
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width">
	<title>${escapeHtml(result.id)} - PixelRefiner quality report</title>
	<script>${renderThemeBootstrapScript()}</script>
	<style>
${DETAIL_REPORT_STYLES}	</style>
</head>
<body>
	<a class="back-link" href="../../index.html" data-i18n="backToReport">Back to report</a>
	<main>
		<h1>
			${escapeHtml(result.id)}
			<span class="badge target-${result.targetStatus}" data-i18n="${targetStateKey}">${result.targetStatus}</span>
			${changeBadge}
			<span class="badge parameter-${result.parameterMode}"
				data-i18n="${result.parameterMode === "auto" ? "autoParameters" : "explicitParameters"}">${result.parameterMode}</span>
		</h1>
		<p class="case-description" data-description-en="${escapeHtml(description.en)}"
			data-description-ja="${escapeHtml(description.ja)}">${escapeHtml(description.en)}</p>
		<p>${tags}</p>
		${previousRunSummary}
		${processingTime}
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
							${comparisonHeader("baseline", "Baseline")}
							<th data-i18n="current">Current</th>
							${comparisonHeader("delta", "Delta")}
							<th data-i18n="verdict">Verdict</th>
						</tr>
					</thead>
					<tbody>${metricRows}</tbody>
				</table>
			</div>
			${regressionSummary}
			${metricReferenceNote}
		</section>
		${renderTargetComparison(result)}
		${renderWarningDetails(result)}
		${renderCandidateDiagnostics(result)}
		<section>
			<h2 data-i18n="options">Options</h2>
			<dl>
				<dt data-i18n="inputKind">Input kind</dt><dd>${escapeHtml(result.inputKind)}</dd>
				<dt data-i18n="route">Route</dt><dd data-i18n="${result.route}">${result.route}</dd>
				<dt data-i18n="gridConfidence">Grid confidence</dt><dd>${formatConfidence(result.gridConfidence)}</dd>
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
	// [Intended] 前回生成が無いレポートでは全ケースが "new" になるので、変化の列と
	// その集計を出さない。HTML と同じ判断で、比較できなかった事実を欠測として扱う。
	const previousRunAvailable = hasPreviousRun(results);
	const markdownHeader = [
		"|Case|Target quality|",
		previousRunAvailable ? "Change from previous run|" : "",
		"Output|",
		"Classification confidence|Grid confidence|",
		"Candidate modal (expected)|WARNING presentation|",
		"Decision reason|WARNING codes|Target mean RGBA error|",
		"Target Edge F1|Runtime (ms)|",
	].join("");
	const alignmentRow = `|---|---|${previousRunAvailable ? "---|" : ""}---:|---:|---|---|---|---|---|---:|---:|---:|`;
	const changeSummary = previousRunAvailable
		? `- Changed: ${summary.changed}\n` +
			`- Unchanged: ${summary.unchanged}\n` +
			`- New: ${summary.newCases}\n`
		: "";
	// [Intended] 基準画像と比べられたケースだけを母数にした集計は、母数が全ケースと
	// 違うときだけ範囲を添える。常に添えると通常のレポートに冗長な注記が並ぶ。
	const formatRate = (rate: number | null): string =>
		rate === null ? "n/a" : `${(rate * 100).toFixed(1)}%`;
	const comparedScope =
		summary.comparableCases === summary.caseCount
			? ""
			: ` (${summary.comparableCases} of ${summary.caseCount} cases with a reference output)`;
	const rows = results.cases
		.map((result) =>
			[
				`|${result.id}`,
				`|${result.targetStatus}`,
				previousRunAvailable ? `|${result.changeStatus}` : "",
				`|${result.metrics.outputWidth}x${result.metrics.outputHeight}`,
				`|${formatConfidence(result.classificationConfidence)}`,
				`|${formatConfidence(result.gridConfidence)}`,
				`|${result.candidateModalDecision}`,
				`|${result.warningPresentation}`,
				`|${result.candidateModalReason}`,
				`|${result.warnings.join(", ") || "-"}`,
				`|${formatMetric(result.targetMetrics?.meanRgbaError)}`,
				`|${formatMetric(result.targetMetrics?.edgeF1)}`,
				`|${result.metrics.runtimeMs.toFixed(2)}|`,
			].join(""),
		)
		.join("\n");
	return `# PixelRefiner quality report

- Cases: ${summary.caseCount}
- Target met: ${summary.targetMet}
- Target unmet: ${summary.targetUnmet}
- Cannot assess: ${summary.targetMissing}
${changeSummary}- Top-1 size accuracy: ${formatRate(summary.top1SizeAccuracy)}${comparedScope}
- Top-3 size accuracy: ${formatRate(summary.top3SizeAccuracy)}${comparedScope}
- Confidence/correctness correlation: ${
		summary.confidenceCorrectnessCorrelation === null
			? "n/a"
			: summary.confidenceCorrectnessCorrelation.toFixed(3)
	}${comparedScope}
- Catastrophic failure rate: ${formatRate(summary.catastrophicFailureRate)}${comparedScope}

${markdownHeader}
${alignmentRow}
${rows}
`;
};
