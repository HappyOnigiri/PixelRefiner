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
		expect(html).toContain(
			'<div class="report-layout"><aside class="sidebar">',
		);
		expect(html).not.toContain("<header");
		expect(html).not.toContain("<select");
		expect(html).toContain(
			'class="filter-button active" type="button" data-change-filter="" aria-pressed="true"',
		);
		expect(html).toContain('grid-template-areas:"main sidebar"');
		expect(html).toContain("if(event.target===dialog)dialog.close()");
		expect(html).toContain('class="image-stage"');
		expect(html).toContain(
			"scale=Math.min(stage.clientWidth/image.naturalWidth,stage.clientHeight/image.naturalHeight)",
		);
		expect(html).not.toContain(".images img{width:100%;height:220px");
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
		expect(html.match(/class="case-description"/g)).toHaveLength(
			selectedCases.length,
		);
		const paletteCaseId = "convert-game-boy-pocket-palette";
		const paletteCaseIdIndex = html.indexOf(paletteCaseId);
		const paletteCaseStart = html.lastIndexOf("<article", paletteCaseIdIndex);
		const paletteCaseEnd = html.indexOf("</article>", paletteCaseIdIndex);
		const paletteCase = html.slice(paletteCaseStart, paletteCaseEnd);
		expect(paletteCase).toContain(
			"Convert a continuous-tone image to the four-color Game Boy Pocket palette without dithering.",
		);
		expect(paletteCase).toContain(
			"\u30b2\u30fc\u30e0\u30dc\u30fc\u30a4\u30dd\u30b1\u30c3\u30c8\u306e4\u8272\u30d1\u30ec\u30c3\u30c8",
		);
		const compactCaseId = "remove-background-trim-auto-grid";
		const compactCaseIdIndex = html.indexOf(compactCaseId);
		const compactCaseStart = html.lastIndexOf("<article", compactCaseIdIndex);
		const compactCaseEnd = html.indexOf("</article>", compactCaseIdIndex);
		const compactCase = html.slice(compactCaseStart, compactCaseEnd);
		expect(compactCase.match(/<figure>/g)).toHaveLength(2);
		expect(compactCase).toContain('data-i18n="input"');
		expect(compactCase).toContain('data-i18n="result"');
		expect(compactCase).toContain(
			`href="cases/${compactCaseId}/index.html" data-i18n="details"`,
		);
		const reviewCaseIdIndex = html.indexOf("restore-bilinear-to-8x8");
		const reviewCaseStart = html.lastIndexOf("<article", reviewCaseIdIndex);
		const reviewCaseEnd = html.indexOf("</article>", reviewCaseIdIndex);
		const reviewCase = html.slice(reviewCaseStart, reviewCaseEnd);
		expect(reviewCase).toContain(
			'href="cases/restore-bilinear-to-8x8/index.html" data-i18n="details"',
		);
		const compactDetail = readFileSync(
			path.join(reportRoot, "cases", compactCaseId, "index.html"),
			"utf8",
		);
		expect(compactDetail).toContain('href="../../index.html"');
		expect(compactDetail).toContain(".back-link:hover{border-color:#c2b4ff");
		expect(compactDetail).toContain('<h2 data-i18n="comparison">');
		expect(compactDetail).toContain('<h2 data-i18n="options">');
		expect(compactDetail).toContain('class="case-description"');
		expect(compactDetail).toContain('class="image-stage dialog-stage"');
		for (const imageKey of [
			"input",
			"groundTruth",
			"baseline",
			"result",
			"groundTruthDifference",
			"baselineDifference",
			"backgroundMask",
		]) {
			expect(compactDetail).toContain(`data-i18n="${imageKey}"`);
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
			expect(html).toContain(`<code>${commit.slice(0, 7)}</code>`);
		}
		expect(html).toContain(
			`<time datetime="${results.metadata.generatedAt}">${results.metadata.generatedAt}</time>`,
		);
		for (const qualityCase of selectedCases) {
			expect(
				existsSync(
					path.join(reportRoot, "cases", qualityCase.id, "index.html"),
				),
			).toBe(true);
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
