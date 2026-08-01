import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateQualityReport, reportRoot } from "./benchmark";
import { loadCases } from "./manifest";

const enabled = process.env.QUALITY_REPORT === "1";

describe.skipIf(!enabled)("quality report", () => {
	it("writes JSON, Markdown, HTML, and every case artifact", () => {
		const allCases = loadCases();
		const profile = process.env.QUALITY_PROFILE ?? "full";
		const selectedCases = allCases.filter(
			(qualityCase) => profile === "full" || qualityCase.profile === "smoke",
		);
		const results = generateQualityReport(selectedCases);
		expect(results.cases).toHaveLength(selectedCases.length);
		expect(existsSync(path.join(reportRoot, "index.html"))).toBe(true);
		expect(existsSync(path.join(reportRoot, "summary.md"))).toBe(true);
		expect(existsSync(path.join(reportRoot, "results.json"))).toBe(true);
		const serialized = JSON.parse(
			readFileSync(path.join(reportRoot, "results.json"), "utf8"),
		) as { cases: unknown[] };
		expect(serialized.cases).toHaveLength(selectedCases.length);
		const html = readFileSync(path.join(reportRoot, "index.html"), "utf8");
		expect(html).toContain("navigator.languages");
		expect(html).toContain('data-i18n="title"');
		expect(html).not.toContain("<select");
		expect(html).toContain(
			'class="filter-button active" type="button" data-change-filter="changed" aria-pressed="true"',
		);
		expect(html).toContain('data-change-filter=""');
		expect(html).toContain('data-change-filter="regressed"');
		const changeGroupIndex = html.indexOf('<legend data-i18n="changeStatus">');
		const qualityGroupIndex = html.indexOf(
			'<legend data-i18n="qualityStatus">',
		);
		const searchIndex = html.indexOf('class="search-row"');
		expect(changeGroupIndex).toBeGreaterThan(-1);
		expect(qualityGroupIndex).toBeGreaterThan(changeGroupIndex);
		expect(searchIndex).toBeGreaterThan(qualityGroupIndex);
		expect(html).toContain('id="active-change-label"');
		expect(html).toContain('id="visible-count"');
		const compactCaseId = "legacy-resize-remove-background";
		const compactCaseIdIndex = html.indexOf(compactCaseId);
		const compactCaseStart = html.lastIndexOf("<article", compactCaseIdIndex);
		const compactCaseEnd = html.indexOf("</article>", compactCaseIdIndex);
		const compactCase = html.slice(compactCaseStart, compactCaseEnd);
		expect(compactCase.match(/<figure>/g)).toHaveLength(1);
		expect(compactCase).toContain('data-i18n="result"');
		expect(compactCase).not.toContain('data-i18n="comparison"');
		const reviewCaseIdIndex = html.indexOf("generated-bilinear");
		const reviewCaseStart = html.lastIndexOf("<article", reviewCaseIdIndex);
		const reviewCaseEnd = html.indexOf("</article>", reviewCaseIdIndex);
		const reviewCase = html.slice(reviewCaseStart, reviewCaseEnd);
		expect(reviewCase).toContain('<summary data-i18n="comparison">');
		expect(reviewCase).toContain('<summary data-i18n="diagnostics">');
		for (const imageKey of [
			"input",
			"groundTruth",
			"baseline",
			"result",
			"groundTruthDifference",
			"baselineDifference",
			"backgroundMask",
		]) {
			expect(reviewCase).toContain(`data-i18n="${imageKey}"`);
		}
		expect(html).toContain("\u54c1\u8cea\u30ec\u30dd\u30fc\u30c8");
		expect(html).toContain(
			`href="${results.metadata.repositoryUrl}/pull/${encodeURIComponent(results.metadata.prNumber)}"`,
		);
		for (const commit of [
			results.metadata.headCommit,
			results.metadata.baseCommit,
			results.metadata.baselineCommit,
		]) {
			expect(html).toContain(
				`href="${results.metadata.repositoryUrl}/commit/${encodeURIComponent(commit)}"`,
			);
		}
		for (const qualityCase of selectedCases) {
			expect(
				existsSync(
					path.join(reportRoot, "cases", qualityCase.id, "result.png"),
				),
			).toBe(true);
			const result = results.cases.find(
				(caseResult) => caseResult.id === qualityCase.id,
			);
			if (result?.files.baseline) {
				expect(existsSync(path.join(reportRoot, result.files.baseline))).toBe(
					true,
				);
			}
		}
	}, 120_000);
});
