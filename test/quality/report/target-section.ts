import type {
	QualityCaseResult,
	QualityTargetMetrics,
	QualityTargetStatus,
} from "../types";
import { escapeHtml, formatMetric } from "./format";

export const TARGET_STATE_KEYS: Record<QualityTargetStatus, string> = {
	met: "targetMet",
	unmet: "targetUnmet",
	missing: "targetMissing",
};

const metricRow = (key: string, label: string, value: string): string =>
	`<tr><th data-i18n="${key}">${label}</th><td>${value}</td></tr>`;

const booleanValue = (value: boolean): string =>
	`<span data-i18n="${value ? "yes" : "no"}">${value ? "yes" : "no"}</span>`;

// [Intended] 目標と寸法が違うと edgeF1・背景マスク IoU・小成分保持は 0 になる。
// サイズ一致の行を先に出すのは、その 0 が「品質が最低」ではなく「寸法が違うので
// 画素同士を対応づけられない」ことを表すと読めるようにするため。
const targetRows = (target: QualityTargetMetrics): string =>
	[
		metricRow(
			"outputSize",
			"Output size",
			`${String(target.targetWidth)}x${String(target.targetHeight)}`,
		),
		metricRow("sizeMatches", "Size matches", booleanValue(target.sizeMatches)),
		metricRow("exactMatch", "Exact match", booleanValue(target.exactMatch)),
		metricRow(
			"meanRgbaError",
			"Mean RGBA error",
			formatMetric(target.meanRgbaError),
		),
		metricRow("edgeF1", "Edge F1", formatMetric(target.edgeF1)),
		metricRow(
			"backgroundMaskIou",
			"Background mask IoU",
			formatMetric(target.backgroundMaskIou),
		),
		metricRow(
			"smallComponentRetention",
			"Small component retention",
			formatMetric(target.smallComponentRetention),
		),
	].join("\n");

/**
 * 固定した目標画像との比較。ベースライン比較の表とは別に置く。
 * 片方は「前回から何が変わったか」、こちらは「あるべき姿にどれだけ足りないか」で、
 * 混ぜると改善のたびに動く値と動かない値が同じ表に並んで読めなくなる。
 */
export const renderTargetComparison = (result: QualityCaseResult): string => {
	const target = result.targetMetrics;
	if (target === null) {
		return `<section>
			<h2 data-i18n="targetComparison">Target comparison</h2>
			<p data-i18n="targetUnregistered">No target registered for this case</p>
		</section>`;
	}
	const source =
		result.targetSource === null
			? ""
			: `<p><strong data-i18n="targetSource">Target source</strong>: ` +
				`<code>${escapeHtml(result.targetSource)}</code></p>`;
	const verdictKey = TARGET_STATE_KEYS[result.targetStatus];
	const failures =
		result.targetFailedAssertions.length === 0
			? ""
			: `<p><strong data-i18n="targetUnmet">Target unmet</strong>: ` +
				result.targetFailedAssertions
					.map(
						(assertion) =>
							`<span data-i18n="assertions.${escapeHtml(assertion)}">${escapeHtml(assertion)}</span>`,
					)
					.join(", ") +
				"</p>";
	return `<section>
		<h2 data-i18n="targetComparison">Target comparison</h2>
		<p><span class="badge target-${result.targetStatus}" data-i18n="${verdictKey}">${result.targetStatus}</span></p>
		${source}
		${failures}
		<div class="table-scroll">
			<table>
				<tbody>${targetRows(target)}</tbody>
			</table>
		</div>
	</section>`;
};
