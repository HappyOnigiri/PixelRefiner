import type { QualityRolloutResults } from "../types";

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`;

export const renderRolloutSidebar = (
	rollout: QualityRolloutResults,
): string => {
	const summary = rollout.summary;
	return `<section class="report-meta" aria-labelledby="rollout-title">
	<h2 id="rollout-title" data-i18n="rolloutComparison">Default Auto vs Legacy</h2>
	<dl>
		<dt data-i18n="changedCases">Changed cases</dt><dd>${summary.outputChanged}/${summary.caseCount}</dd>
		<dt data-i18n="routeChanges">Route changes</dt><dd>${summary.routeChanged}</dd>
		<dt data-i18n="regressedCases">Regressed cases</dt><dd>${summary.regressed}</dd>
		<dt data-i18n="top1Accuracy">Top-1 size accuracy</dt>
		<dd>${formatPercent(summary.nextTop1SizeAccuracy)} / ${formatPercent(summary.legacyTop1SizeAccuracy)}</dd>
		<dt data-i18n="top3Accuracy">Top-3 size accuracy</dt>
		<dd>${formatPercent(summary.nextTop3SizeAccuracy)} / ${formatPercent(summary.legacyTop3SizeAccuracy)}</dd>
		<dt data-i18n="determinism">Default Auto determinism</dt><dd>${formatPercent(summary.nextByteIdentityRate)}</dd>
	</dl>
</section>`;
};

export const renderRolloutMarkdown = (
	rollout: QualityRolloutResults,
): string => {
	const summary = rollout.summary;
	const rows = rollout.cases
		.map((result) => {
			const regressions =
				result.regressedMetrics.length === 0
					? "-"
					: result.regressedMetrics.join(", ");
			return [
				`|${result.id}`,
				`|${result.next.route} ${result.next.metrics.outputWidth}x${result.next.metrics.outputHeight}`,
				`|${result.legacy.route} ${result.legacy.metrics.outputWidth}x${result.legacy.metrics.outputHeight}`,
				`|${result.outputChanged ? "yes" : "no"}`,
				`|${regressions}|`,
			].join("");
		})
		.join("\n");
	return `## Default Auto vs Legacy

- Cases with output changes: ${summary.outputChanged}/${summary.caseCount}
- Cases with route changes: ${summary.routeChanged}/${summary.caseCount}
- Cases with metric regressions: ${summary.regressed}/${summary.caseCount}
- Top-1 size accuracy: ${formatPercent(summary.nextTop1SizeAccuracy)} / ${formatPercent(summary.legacyTop1SizeAccuracy)} (Default Auto / Legacy)
- Top-3 size accuracy: ${formatPercent(summary.nextTop3SizeAccuracy)} / ${formatPercent(summary.legacyTop3SizeAccuracy)} (Default Auto / Legacy)
- Deterministic output: ${formatPercent(summary.nextByteIdentityRate)}
- Catastrophic failure rate: ${formatPercent(summary.nextCatastrophicFailureRate)} / ${formatPercent(
		summary.legacyCatastrophicFailureRate,
	)} (Default Auto / Legacy)

|Case|Default Auto|Legacy|Output changed|Regressed metrics|
|---|---|---|---:|---|
${rows}`;
};
