import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { generateQualityReport, reportRoot } from "./benchmark";
import { loadCases, selectCasesForProfile } from "./manifest";

const enabled = process.env.QUALITY_REPORT === "1";

describe.skipIf(!enabled)("quality report", () => {
	// [Policy] 共有CIランナーでも全品質ケースの生成を完了できるよう、通常のテストより長く待機する。
	it("writes JSON, Markdown, HTML, and every case artifact", () => {
		const allCases = loadCases();
		const selectedCases = selectCasesForProfile(allCases);
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
		const clientScript = html.match(/<script>([\s\S]+)<\/script>/)?.[1];
		if (clientScript === undefined) throw new Error("Client script not found");
		expect(() => new Script(clientScript)).not.toThrow();
		expect(html).toContain("navigator.languages");
		expect(html).toContain('data-i18n="title"');
		expect(html).toContain('<div class="report-layout">');
		expect(html).toContain('<aside class="sidebar">');
		expect(html).not.toContain("<header");
		expect(html).not.toContain("<select");
		expect(html).toContain('<legend data-i18n="language">');
		expect(html).toContain('data-locale="ja"');
		expect(html).toContain('data-locale="en"');
		expect(html).toContain('data-locale="zh-CN"');
		expect(html).toContain('"zh-CN":{"title":"PixelRefiner 质量报告"');
		expect(html).toContain(
			'class="filter-button active" type="button" data-change-filter="" aria-pressed="true"',
		);
		expect(html).toContain('grid-template-areas: "main sidebar"');
		expect(html).toContain("event.target === dialog");
		expect(html).toContain('class="image-stage"');
		expect(html).toContain(
			"Math.min(stage.clientWidth / image.naturalWidth, stage.clientHeight / image.naturalHeight)",
		);
		expect(html).not.toContain(".images img{width:100%;height:220px");
		expect(html).toContain('data-change-filter=""');
		expect(html).toContain('data-change-filter="changed"');
		expect(html).toContain('data-change-filter="new"');
		expect(html).toContain('data-change-filter="regressed"');
		const changeGroupIndex = html.indexOf('<legend data-i18n="changeStatus">');
		const parameterGroupIndex = html.indexOf(
			'<legend data-i18n="parameterMode">',
		);
		const qualityGroupIndex = html.indexOf(
			'<legend data-i18n="qualityStatus">',
		);
		const searchIndex = html.indexOf('class="search-row"');
		expect(changeGroupIndex).toBeGreaterThan(-1);
		expect(parameterGroupIndex).toBeGreaterThan(changeGroupIndex);
		expect(qualityGroupIndex).toBeGreaterThan(parameterGroupIndex);
		expect(searchIndex).toBeGreaterThan(qualityGroupIndex);
		expect(html).toContain('data-parameter-filter=""');
		expect(html).toContain('data-parameter-filter="explicit"');
		expect(html).toContain('data-parameter-filter="auto"');
		expect(html).toContain('parameterMode":"パラメータ"');
		expect(html).toContain('explicitParameters":"オプション指定あり"');
		expect(html).toContain('autoParameters":"自動判定"');
		expect(html).toContain("card.dataset.parameter === activeParameter");
		expect(html).toContain('id="active-parameter-label"');
		const explicitCount = html.match(/data-parameter="explicit"/g)?.length ?? 0;
		const autoCount = html.match(/data-parameter="auto"/g)?.length ?? 0;
		expect(explicitCount + autoCount).toBe(selectedCases.length);
		expect(autoCount).toBe(results.summary.autoCases);
		expect(explicitCount).toBe(results.summary.explicitCases);
		expect(autoCount).toBeGreaterThan(0);
		const autoCaseId = "auto-quality-nearest-4x";
		const autoCaseIdIndex = html.indexOf(autoCaseId);
		const autoCase = html.slice(
			html.lastIndexOf("<article", autoCaseIdIndex),
			html.indexOf("</article>", autoCaseIdIndex),
		);
		expect(autoCase).toContain('data-parameter="auto"');
		expect(autoCase).toContain(
			"Process the fixture with Auto and the default settings only",
		);
		expect(autoCase).toContain("Autoと既定設定のみでfixtureを処理し");
		expect(
			existsSync(path.join(reportRoot, "cases", autoCaseId, "index.html")),
		).toBe(true);
		expect(html).toContain('id="active-change-label"');
		expect(html).toContain('id="visible-count"');
		expect(html).toContain("unchanged from base branch");
		expect(html).toContain("base branchと差分なし");
		expect(html).toContain('new":"新規追加"');
		expect(html).toContain("card.dataset.change === activeChange");
		expect(html).not.toContain('activeChange === "changed"');
		expect(html).not.toContain("Preserve the image.");
		expect(html).not.toContain("画像を保持します。");
		expect(html.match(/class="case-description"/g)).toHaveLength(
			selectedCases.length,
		);
		expect(html.match(/class="case-metrics"/g)).toHaveLength(
			selectedCases.length,
		);
		expect(html).toContain(".case-metrics { font-size: .62rem");
		expect(html.match(/data-i18n="processingTime"/g)).toHaveLength(
			selectedCases.length,
		);
		expect(html.match(/data-i18n="confidence"/g)).toHaveLength(
			selectedCases.length,
		);
		expect(html).toContain('processingTime":"時間"');
		expect(html).toContain('confidence":"信頼度（診断値）"');
		const paletteCaseId = "convert-game-boy-pocket-palette";
		const paletteCaseIdIndex = html.indexOf(paletteCaseId);
		const paletteCaseStart = html.lastIndexOf("<article", paletteCaseIdIndex);
		const paletteCaseEnd = html.indexOf("</article>", paletteCaseIdIndex);
		const paletteCase = html.slice(paletteCaseStart, paletteCaseEnd);
		expect(paletteCase).toContain(
			`data-search="${paletteCaseId} PRF-001 palette-conversion`,
		);
		expect(paletteCase).toContain(
			"Convert a continuous-tone image to the four-color Game Boy Pocket palette without dithering.",
		);
		expect(paletteCase).toContain("ゲームボーイポケットの4色パレット");
		const deterministicCaseId = "convert-deterministic-auto-palette";
		const deterministicCaseIdIndex = html.indexOf(deterministicCaseId);
		const deterministicCaseStart = html.lastIndexOf(
			"<article",
			deterministicCaseIdIndex,
		);
		const deterministicCaseEnd = html.indexOf(
			"</article>",
			deterministicCaseIdIndex,
		);
		const deterministicCase = html.slice(
			deterministicCaseStart,
			deterministicCaseEnd,
		);
		expect(deterministicCase).toContain(
			"Keep the image at its original 32 x 32 pixel dimensions and preserve " +
				"fully transparent pixels while reducing its 947 opaque input colors " +
				"to an automatically selected eight-color palette with full-strength Ordered dithering.",
		);
		expect(deterministicCase).toContain(
			"画像を32×32ピクセルの原寸に保ち、完全透明な画素を維持したまま、" +
				"947色ある不透明な入力色をAutoで選択した8色のパレットへ減色し、" +
				"強度100%のOrderedディザリングを適用します。",
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
		const exactCaseId = "restore-nearest-2x-to-8x8";
		const exactCaseIdIndex = html.indexOf(exactCaseId);
		const exactCaseStart = html.lastIndexOf("<article", exactCaseIdIndex);
		const exactCaseEnd = html.indexOf("</article>", exactCaseIdIndex);
		const exactCase = html.slice(exactCaseStart, exactCaseEnd);
		expect(exactCase).toContain('data-i18n="exactMatchShort"');
		expect(exactCase).toContain('data-i18n="yes"');
		expect(exactCase).toMatch(
			/<strong data-i18n="meanRgbaErrorShort">Error<\/strong> 0\/0/,
		);
		const compactDetail = readFileSync(
			path.join(reportRoot, "cases", compactCaseId, "index.html"),
			"utf8",
		);
		expect(compactDetail).toContain('href="../../index.html"');
		expect(compactDetail).toContain(".back-link:hover { border-color: #c2b4ff");
		expect(compactDetail).toContain('<h2 data-i18n="comparison">');
		expect(compactDetail).toContain('<h2 data-i18n="options">');
		expect(compactDetail).toContain(
			'<dt data-i18n="confidence">Confidence (diagnostic)</dt>',
		);
		expect(compactDetail).toContain(
			`<dd>${results.cases
				.find((result) => result.id === compactCaseId)
				?.confidence?.toFixed(4)}</dd>`,
		);
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
		expect(html).toContain("品質レポート");
		const markdown = readFileSync(path.join(reportRoot, "summary.md"), "utf8");
		expect(markdown).toContain("|Confidence (diagnostic)|");
		expect(markdown).toContain(`- New: ${results.summary.newCases}`);
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
	}, 1_200_000);
});
