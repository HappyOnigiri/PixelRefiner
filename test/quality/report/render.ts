import path from "node:path";
import type { QualityCaseResult, QualityResults } from "../types";
import { runQualityReportClient } from "./client";
import { escapeHtml, formatMetric } from "./format";
import { DETAIL_REPORT_STYLES, INDEX_REPORT_STYLES } from "./styles";
import { renderTargetComparison, TARGET_STATE_KEYS } from "./target-section";
import { REPORT_TRANSLATIONS } from "./translations";

const renderClientScript = (): string =>
	`window.__QUALITY_REPORT_TRANSLATIONS__=${JSON.stringify(REPORT_TRANSLATIONS)};(${runQualityReportClient.toString()})();`;

const formatConfidence = (value: number | null): string =>
	value === null ? "-" : value.toFixed(4);

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

// [Policy] ケースの説明だけで内容を理解できるように、入力の特性、検証する処理、
// 変化してはならない点を記載する。画像テストの追加時は「画像を保持する」のような
// 曖昧な表現を避ける。
const describeCase = (
	result: QualityCaseResult,
): { en: string; ja: string } => {
	const options = result.options;
	if (result.parameterMode === "auto") {
		return {
			en:
				"Process the fixture with Auto and the default settings only, with no case-specific options, " +
				"and keep the automatic classification, route, and output grid identical to the approved baseline. " +
				"The target comparison additionally measures how far the output still is from the fixed target image.",
			ja:
				"ケース固有のオプションを与えず、Autoと既定設定のみでfixtureを処理し、" +
				"自動判定の分類、route、出力グリッドを承認済みベースラインから変化させないことを確認します。" +
				"あわせて、固定した目標画像までの残りの差を目標との比較で測ります。",
		};
	}
	if (result.id === "restore-thin-features-and-alpha-coverage") {
		return {
			en:
				"Restore area-coverage alpha from enlarged artwork containing thin lines and highlights, " +
				"while selecting an input RGB without mixing in hidden colors from transparent pixels.",
			ja:
				"細線とハイライトを含む拡大画像から面積被覆アルファを復元し、" +
				"透明画素の隠れた色を混入させずに入力に存在するRGBを選択します。",
		};
	}
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
	if (result.id === "convert-continuous-tone-balanced") {
		return {
			en:
				"Route a 48 x 32 continuous-tone image through Auto to the Convert pipeline, " +
				"derive three candidate resolutions from its aspect ratio and information density, " +
				"and emit the balanced candidate at 24 x 16 with edge-aware resampling instead of restoring an original grid.",
			ja:
				"48×32の連続階調画像をAuto判定からConvertパイプラインへ流し、" +
				"縦横比と情報量から3つの候補解像度を導出したうえで、" +
				"元グリッドの復元ではなく標準候補の24×16へエッジ考慮のリサンプルで変換します。",
		};
	}
	if (result.id === "convert-illustration-detailed") {
		return {
			en:
				"Convert a 72 x 48 illustration with transparent margins and thin high-contrast lines " +
				"to the detailed candidate at 54 x 36, keeping fully transparent pixels transparent and " +
				"never picking the RGB of a nearly transparent pixel as a cell's representative color.",
			ja:
				"透明余白と高コントラストの細線を含む72×48のイラストを細かめ候補の54×36へ変換し、" +
				"完全透明な画素を透明に保ったまま、ほぼ透明な画素のRGBをセルの代表色に選ばないことを確認します。",
		};
	}
	if (result.id === "retain-protected-small-details") {
		return {
			en:
				"Remove isolated background noise while retaining paired eyes, dakuten, " +
				"and disconnected star and spark details in native-resolution pixel art.",
			ja:
				"等倍のドット絵から孤立した背景ノイズを除去しつつ、対になった目、濁点、" +
				"分離した星と光の細部を保持します。",
		};
	}
	if (result.id === "remove-isolated-small-noise") {
		return {
			en:
				"Remove a weak isolated one-pixel noise component from a uniform background " +
				"without changing the main native-resolution subject.",
			ja:
				"一様な背景にある弱い1ピクセルの孤立ノイズを除去し、" +
				"等倍の主被写体を変化させずに保持します。",
		};
	}
	if (result.id === "skip-small-removal-on-uncertain-background") {
		return {
			en:
				"Keep every pixel unchanged when automatic background confidence is too low " +
				"to safely classify disconnected details as removable noise.",
			ja:
				"自動背景の信頼度が低く、分離した細部を除去可能なノイズと安全に判定できない場合は、" +
				"すべての画素を変更せずに保持します。",
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
	const generatedAt = `<dt data-i18n="generatedAt">Generated</dt>
			<dd><time datetime="${escapeHtml(results.metadata.generatedAt)}">${escapeHtml(formatGeneratedAt(results.metadata.generatedAt))}</time></dd>`;
	const reportMetadata =
		results.metadata.prNumber === "local"
			? `<section class="report-meta" aria-labelledby="report-meta-title">
		<h2 id="report-meta-title" data-i18n="localReport">Viewing locally</h2>
		<dl>${generatedAt}</dl>
	</section>`
			: `<section class="report-meta" aria-labelledby="report-meta-title">
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
			${generatedAt}
			<dt data-i18n="workflow">Workflow</dt>
			<dd><a href="${escapeHtml(results.metadata.workflowRunUrl)}" data-i18n="workflow">workflow</a></dd>
		</dl>
	</section>`;
	return `<aside class="sidebar">
	<h1 data-i18n="title">PixelRefiner quality report</h1>
	<div class="report-overview">
		<p><span data-i18n="targetUnmet">Target unmet</span>: <strong>${results.summary.targetUnmet}</strong></p>
		<p><span data-i18n="targetMissing">Cannot assess</span>: <strong>${results.summary.targetMissing}</strong></p>
		<p><span data-i18n="changed">Changed</span>: <strong>${results.summary.changed}</strong></p>
		<p><span data-i18n="unchanged">Unchanged</span>: <strong>${results.summary.unchanged}</strong></p>
		<p><span data-i18n="new">New</span>: <strong>${results.summary.newCases}</strong></p>
	</div>
	${reportMetadata}
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
		<fieldset class="filter-group">
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
		</fieldset>
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
			<strong id="active-change-label"></strong> &times;
			<strong id="active-parameter-label"></strong> &mdash;
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
</aside>`;
};

export const renderHtml = (results: QualityResults): string => {
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
				' &middot; <strong data-i18n="confidence">Confidence (diagnostic)</strong> ',
				`${formatConfidence(result.confidence)}</small>`,
			].join("");
			const targetFailures =
				result.targetFailedAssertions.length === 0
					? ""
					: `<p class="target-failures"><strong data-i18n="failed">Target unmet</strong>: ` +
						result.targetFailedAssertions
							.map(
								(assertion) =>
									`<span data-i18n="assertions.${escapeHtml(assertion)}">${escapeHtml(assertion)}</span>`,
							)
							.join(", ") +
						"</p>";
			const searchable = [
				result.id,
				...result.featureIds,
				result.parameterMode,
				result.targetStatus,
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
				["groundTruth", "Target", result.files.groundTruth],
				["result", "Result", result.files.result],
				["groundTruthDifference", "Target difference", result.files.diff],
			]);
			return `<article class="case target-${targetState} ${result.changeStatus}"
			data-quality="${targetState}" data-change="${result.changeStatus}"
			data-parameter="${result.parameterMode}"
			data-search="${escapeHtml(searchable)}">
			<h2>
				${escapeHtml(result.id)}
				<span class="badge target-${targetState}" data-i18n="${TARGET_STATE_KEYS[targetState]}">${targetState}</span>
				<span class="badge ${result.changeStatus}" data-i18n="${result.changeStatus}">${result.changeStatus}</span>
				<span class="badge parameter-${result.parameterMode}"
					data-i18n="${result.parameterMode === "auto" ? "autoParameters" : "explicitParameters"}">${result.parameterMode}</span>
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
	const targetStateKey = TARGET_STATE_KEYS[result.targetStatus];
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
	const metricState = (
		key: string,
	): { className: string; translationKey: string; label: string } => {
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
		return `<tr class="${state.className}">
			<th data-i18n="${key}">${key}</th>
			<td>${escapeHtml(target)}</td>
			<td>${formatMetric(baseline)}</td>
			<td>${formatMetric(current)}</td>
			<td>${deltaText}</td>
			<td data-i18n="${state.translationKey}">${state.label}</td>
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
			<span class="badge target-${result.targetStatus}" data-i18n="${targetStateKey}">${result.targetStatus}</span>
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
		${renderTargetComparison(result)}
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
				`|${result.targetStatus}`,
				`|${result.changeStatus}`,
				`|${result.metrics.outputWidth}x${result.metrics.outputHeight}`,
				`|${formatConfidence(result.confidence)}`,
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
- Changed: ${summary.changed}
- Unchanged: ${summary.unchanged}
- New: ${summary.newCases}
- Top-1 size accuracy: ${(summary.top1SizeAccuracy * 100).toFixed(1)}%
- Top-3 size accuracy: ${(summary.top3SizeAccuracy * 100).toFixed(1)}%
- Confidence/correctness correlation: ${
		summary.confidenceCorrectnessCorrelation === null
			? "n/a"
			: summary.confidenceCorrectnessCorrelation.toFixed(3)
	}
- Catastrophic failure rate: ${(summary.catastrophicFailureRate * 100).toFixed(
		1,
	)}%

|Case|Target quality|Change from previous run|Output|Confidence (diagnostic)|Target mean RGBA error|Target Edge F1|Runtime (ms)|
|---|---|---|---:|---:|---:|---:|---:|
${rows}
`;
};
