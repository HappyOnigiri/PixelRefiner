import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { reportRoot } from "./benchmark";
import { loadCases, selectCasesForProfile } from "./manifest";
import { aggregateQualityReport } from "./report/aggregate";
import { renderHtml } from "./report/render";

const enabled = process.env.QUALITY_REPORT === "1";

describe.skipIf(!enabled)("quality report", () => {
	// [Intended] ケースの実処理は test/quality/shards が済ませている。ここは部分結果を
	// 集約して成果物を書くだけなので、画像処理ぶんの待機時間は要らない。
	it("writes JSON, Markdown, HTML, and every case artifact", () => {
		const allCases = loadCases();
		const selectedCases = selectCasesForProfile(allCases);
		const results = aggregateQualityReport(selectedCases);
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
		const localHtml = renderHtml({
			...results,
			metadata: {
				...results.metadata,
				prNumber: "local",
				headCommit: "local",
				baseCommit: "local",
				workflowRunUrl: "local",
			},
		});
		const reportMetaStart = localHtml.indexOf('<section class="report-meta"');
		const reportMetaEnd = localHtml.indexOf("</section>", reportMetaStart);
		const reportMeta = localHtml.slice(reportMetaStart, reportMetaEnd);
		expect(reportMeta).toContain('data-i18n="localReport"');
		expect(reportMeta).toContain("Viewing locally");
		expect(reportMeta).toContain('data-i18n="generatedAt"');
		expect(reportMeta).not.toContain('data-i18n="reportDetails"');
		expect(reportMeta).not.toContain('data-i18n="pullRequest"');
		expect(reportMeta).not.toContain('data-i18n="headCommit"');
		expect(reportMeta).not.toContain('data-i18n="baseCommit"');
		expect(reportMeta).not.toContain('data-i18n="baselineCommit"');
		expect(reportMeta).not.toContain('data-i18n="workflow"');
		expect(html).not.toContain("<header");
		expect(html).not.toContain("<select");
		expect(html).toContain('<legend data-i18n="language">');
		expect(html).toContain('data-locale="ja"');
		expect(html).toContain('data-locale="en"');
		expect(html).toContain('data-locale="zh-CN"');
		expect(html).toContain('"zh-CN":{"title":"PixelRefiner 质量报告"');
		expect(html).toContain(
			'class="filter-button active" type="button" data-quality-filter="" aria-pressed="true"',
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
		expect(html).toContain('data-change-filter="unchanged"');
		expect(html).toContain('data-change-filter="new"');
		expect(html).not.toContain('data-change-filter="regressed"');
		expect(html).not.toContain('data-change-filter="improved"');
		const qualityGroupIndex = html.indexOf(
			'<legend data-i18n="qualityStatus">',
		);
		const changeGroupIndex = html.indexOf('<legend data-i18n="changeStatus">');
		const parameterGroupIndex = html.indexOf(
			'<legend data-i18n="parameterMode">',
		);
		const searchIndex = html.indexOf('class="search-row"');
		const languageGroupIndex = html.indexOf('<legend data-i18n="language">');
		expect(qualityGroupIndex).toBeGreaterThan(-1);
		expect(changeGroupIndex).toBeGreaterThan(qualityGroupIndex);
		expect(parameterGroupIndex).toBeGreaterThan(changeGroupIndex);
		expect(searchIndex).toBeGreaterThan(parameterGroupIndex);
		expect(languageGroupIndex).toBeGreaterThan(searchIndex);
		expect(html).toContain("margin-bottom: 20px;");
		expect(html).toContain('data-parameter-filter=""');
		expect(html).toContain('data-parameter-filter="explicit"');
		expect(html).toContain('data-parameter-filter="auto"');
		expect(html).toContain('parameterMode":"パラメータ"');
		expect(html).toContain('explicitParameters":"オプション指定あり"');
		expect(html).toContain('autoParameters":"自動判定"');
		expect(html).toContain("card.dataset[group.name] === group.active");
		expect(html).toContain('id="active-parameter-label"');
		expect(html).toContain('data-quality-filter=""');
		expect(html).toContain('data-quality-filter="unmet"');
		expect(html).toContain('data-quality-filter="met"');
		expect(html).toContain('data-quality-filter="missing"');
		expect(html).toContain('id="active-quality-label"');
		expect(html).toContain("new URLSearchParams(window.location.search)");
		expect(html).toContain("window.history.replaceState(");
		expect(html).toContain("url.searchParams.set");
		expect(html).toContain('targetUnmet":"目標未達"');
		// [Intended] 一覧のバッジと絞り込みの件数が同じ集計から出ていることを確かめる。
		// 片方だけずれると、絞り込んだ結果と件数表示が食い違って読めなくなる。
		for (const [state, count] of [
			["met", results.summary.targetMet],
			["unmet", results.summary.targetUnmet],
			["missing", results.summary.targetMissing],
		] as const) {
			expect(
				html.match(new RegExp(`data-quality="${state}"`, "g"))?.length ?? 0,
			).toBe(count);
		}
		expect(
			results.summary.targetMet +
				results.summary.targetUnmet +
				results.summary.targetMissing,
		).toBe(selectedCases.length);
		expect(results.summary.targetUnmet).toBeGreaterThan(0);
		const explicitCount = html.match(/data-parameter="explicit"/g)?.length ?? 0;
		const autoCount = html.match(/data-parameter="auto"/g)?.length ?? 0;
		expect(explicitCount + autoCount).toBe(selectedCases.length);
		expect(autoCount).toBe(results.summary.autoCases);
		expect(explicitCount).toBe(results.summary.explicitCases);
		expect(autoCount).toBeGreaterThan(0);
		const autoCaseId = "auto-resize-with-trimming";
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
		expect(html).toContain("unchanged from previous run / base branch");
		expect(html).toContain('changed":"差分あり"');
		expect(html).toContain('unchanged":"差分なし"');
		expect(html).toContain('new":"新規追加"');
		expect(html).not.toContain('data-change="regressed"');
		expect(html).not.toContain('data-change="improved"');
		for (const [state, count] of [
			["changed", results.summary.changed],
			["unchanged", results.summary.unchanged],
			["new", results.summary.newCases],
		] as const) {
			expect(
				html.match(new RegExp(`data-change="${state}"`, "g"))?.length ?? 0,
			).toBe(count);
		}
		expect(
			results.summary.changed +
				results.summary.unchanged +
				results.summary.newCases,
		).toBe(selectedCases.length);
		expect(html).not.toContain('group.active === "changed"');
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
		expect(
			html.match(/data-i18n="gridConfidence"/g)?.length ?? 0,
		).toBeGreaterThanOrEqual(selectedCases.length);
		expect(html).toContain('processingTime":"時間"');
		expect(html).toContain('gridConfidence":"グリッド信頼度"');
		expect(html).toContain('classificationConfidence":"自動分類信頼度"');
		// [Intended] 一覧はバッジだけを出す。診断値を並べると 1 ケースの高さが伸び、
		// 目標品質の一覧性が落ちるため、信頼度と判定理由はケース詳細へ寄せる。
		expect(html).not.toContain('class="candidate-diagnostics"');
		expect(html).not.toContain('data-i18n="candidateModalReason"');
		expect(html).not.toContain('data-i18n="candidatePlanCount"');
		expect(html).not.toContain('data-i18n="warningPresentation"');
		expect(html).toContain('hasWarnings":"WARNINGあり"');
		expect(html).toContain('hasCandidateSelection":"候補選択あり"');
		expect(html.match(/data-i18n="hasWarnings"/g)?.length ?? 0).toBe(
			results.cases.filter((result) => result.warnings.length > 0).length,
		);
		expect(html.match(/data-i18n="hasCandidateSelection"/g)?.length ?? 0).toBe(
			results.cases.filter(
				(result) => result.candidateModalDecision === "would-show",
			).length,
		);
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
		expect(compactCase.match(/<figure>/g)).toHaveLength(3);
		expect(compactCase).toContain('data-i18n="groundTruth"');
		expect(compactCase).toContain('data-i18n="result"');
		expect(compactCase).toContain('data-i18n="groundTruthDifference"');
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
		// [Intended] 目標を満たした Auto ケースの表示を確認する。エッジの汚染除去で
		// auto-resize-with-trimming は手書きの期待値画像と数階調ずれて目標未達になったため、
		// 同じ Auto ケースで完全一致を保っているものへ差し替えた。
		const targetMetId = "auto-resize-and-remove-bg";
		const targetMetIdIndex = html.indexOf(targetMetId);
		const targetMetStart = html.lastIndexOf("<article", targetMetIdIndex);
		const targetMetEnd = html.indexOf("</article>", targetMetIdIndex);
		const targetMetCase = html.slice(targetMetStart, targetMetEnd);
		expect(targetMetCase).toContain('data-quality="met"');
		expect(targetMetCase).toContain('data-i18n="targetMet"');
		expect(targetMetCase).not.toContain('data-i18n="targetUnmet"');
		expect(targetMetCase).not.toContain(
			'data-i18n="assertions.exact-image-match"',
		);
		expect(targetMetCase).not.toContain('data-i18n="assertions.output-size"');
		const compactDetail = readFileSync(
			path.join(reportRoot, "cases", compactCaseId, "index.html"),
			"utf8",
		);
		expect(compactDetail).toContain('href="../../index.html"');
		expect(compactDetail).toContain(".back-link:hover { border-color: #c2b4ff");
		expect(compactDetail).toContain('<h2 data-i18n="comparison">');
		expect(compactDetail).toContain('<h2 data-i18n="options">');
		expect(compactDetail).toContain(
			'<dt data-i18n="gridConfidence">Grid confidence</dt>',
		);
		expect(compactDetail).toContain(
			`<dd>${results.cases
				.find((result) => result.id === compactCaseId)
				?.gridConfidence?.toFixed(4)}</dd>`,
		);
		expect(compactDetail).toContain(
			'<dt data-i18n="classificationConfidence">Classification confidence</dt>',
		);
		expect(compactDetail).toContain('data-i18n="candidateDiagnostics"');
		expect(compactDetail).toContain('class="case-description"');
		expect(compactDetail).toContain('class="image-stage dialog-stage"');
		// [Intended] 一覧カードと同じ属性を詳細でも読み取れるようにする。
		expect(compactDetail).toContain('class="badge parameter-explicit"');
		expect(compactDetail).toContain(
			'<strong data-i18n="processingTime">Time</strong>',
		);
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
		expect(compactDetail).toContain('<h2 data-i18n="targetComparison">');
		// [Intended] 指標テーブルに行を持たない catastrophicFailure / status の回帰も
		// レポートから辿れるように、regressedMetrics の列挙を必ず出す。
		expect(compactDetail).toContain('data-i18n="regressedMetrics"');
		expect(html).toContain('regressedMetrics":"悪化した指標"');
		expect(html).toContain('catastrophicFailure":"致命的な失敗"');
		expect(html).toContain('status":"合格判定"');
		// [Intended] 自動判定ケースの目標は借り物なので、どのケースから借りたかを出す。
		const autoDetail = readFileSync(
			path.join(reportRoot, "cases", "auto-resize-with-trimming", "index.html"),
			"utf8",
		);
		expect(autoDetail).toContain(
			'<strong data-i18n="targetSource">Target source</strong>: ' +
				"<code>remove-background-trim-resize-46x13</code>",
		);
		expect(autoDetail).toContain(
			'<h2 data-i18n="candidateDiagnostics">Auto candidate diagnostic</h2>',
		);
		expect(autoDetail).toContain('data-i18n="candidateModalWouldNotShow"');
		// [Policy] 候補選択と WARNING の描画は、意図的に低信頼な入力を持つケースで見る。
		// 正しく処理できるケースを標本にすると、検出の改善で標本が静かに失われる。
		const modalCaseId = "show-ui-default-candidates";
		const modalDetail = readFileSync(
			path.join(reportRoot, "cases", modalCaseId, "index.html"),
			"utf8",
		);
		expect(modalDetail).toContain('data-i18n="candidateModalWouldShow"');
		expect(modalDetail).toContain(
			'data-i18n="warningPresentationCandidateModal"',
		);
		// [Intended] WARNING は文言だけでなく、どの判定で付いたかまで詳細から辿れること。
		expect(modalDetail).toContain(
			'<h2 data-i18n="warningDetails">WARNING details</h2>',
		);
		expect(modalDetail).toContain(
			'data-i18n="processingWarnings.LOW_GRID_CONFIDENCE"',
		);
		expect(modalDetail).toContain(
			'data-i18n="warningTriggers.LOW_GRID_CONFIDENCE"',
		);
		expect(modalDetail).toContain(
			'data-i18n="candidateModalReasons.LOW_GRID_CONFIDENCE"',
		);
		// [Intended] 候補選択モーダルが出る見込みのケースは、選択肢とその画像を詳細へ出す。
		expect(modalDetail).toContain(
			'<h3 data-i18n="candidateOptions">Candidate options</h3>',
		);
		expect(modalDetail).toContain('class="images candidate-options"');
		const modalCandidateOptions =
			results.cases.find((result) => result.id === modalCaseId)
				?.candidateOptions ?? [];
		expect(modalCandidateOptions.length).toBeGreaterThan(0);
		for (const option of modalCandidateOptions) {
			expect(modalDetail).toContain(
				`data-i18n="candidateKinds.${option.kind}"`,
			);
			if (option.file === null) continue;
			expect(existsSync(path.join(reportRoot, option.file))).toBe(true);
			expect(modalDetail).toContain(
				`src="${path.posix.basename(option.file)}"`,
			);
		}
		// [Policy] UI 既定のまま処理する auto 側にも、警告と候補選択の標本を必ず 1 件残す。
		// 明示オプションのケースだけを標本にすると、既定経路で候補が出るかを誰も見ていない
		// 状態になる。この入力は論理セルを 2 通りに読めるため、目標へも届いていない。
		const autoModalCaseId = "auto-quality-prf400-ambiguous-grid-scale";
		const autoModalResult = results.cases.find(
			(result) => result.id === autoModalCaseId,
		);
		expect(autoModalResult?.warnings).toContain("LOW_GRID_CONFIDENCE");
		expect(autoModalResult?.candidateModalDecision).toBe("would-show");
		expect(autoModalResult?.targetStatus).toBe("unmet");
		const autoModalDetail = readFileSync(
			path.join(reportRoot, "cases", autoModalCaseId, "index.html"),
			"utf8",
		);
		expect(autoModalDetail).toContain('class="badge parameter-auto"');
		expect(autoModalDetail).toContain('data-i18n="candidateModalWouldShow"');
		expect(autoModalDetail).toContain(
			'data-i18n="warningPresentationCandidateModal"',
		);
		expect(autoModalDetail).toContain('class="images candidate-options"');
		// [Intended] 候補生成はモーダルが出る見込みのケースだけに限る。品質ゲートと
		// 表示されないケースに候補 1 件あたり 1 回の追加処理を持ち込まないため。
		for (const result of results.cases) {
			if (result.candidateModalDecision === "would-show") continue;
			expect(result.candidateOptions).toEqual([]);
		}
		expect(autoDetail).toContain('data-i18n="sizeMatches"');
		expect(autoDetail).toContain('class="badge parameter-auto"');
		expect(results.summary.targetMissing).toBe(0);
		expect(html).toContain("品質レポート");
		const markdown = readFileSync(path.join(reportRoot, "summary.md"), "utf8");
		expect(markdown).toContain("|Classification confidence|Grid confidence|");
		expect(markdown).toContain(
			"|Candidate modal (expected)|WARNING presentation|",
		);
		expect(markdown).toContain("|Decision reason|WARNING codes|");
		expect(markdown).toContain(`- New: ${results.summary.newCases}`);
		const uiCandidateCase = results.cases.find(
			(result) => result.id === "show-ui-default-candidates",
		);
		expect(uiCandidateCase?.warnings).toContain("LOW_GRID_CONFIDENCE");
		expect(uiCandidateCase?.candidatePlanCount).toBeGreaterThan(0);
		expect(uiCandidateCase?.candidateModalDecision).toBe("would-show");
		expect(uiCandidateCase?.warningPresentation).toBe("candidate-modal");
		expect(markdown).toContain(`- Changed: ${results.summary.changed}`);
		expect(markdown).toContain(`- Unchanged: ${results.summary.unchanged}`);
		expect(markdown).toContain(`- New: ${results.summary.newCases}`);
		expect(markdown).not.toContain("- Regressed:");
		expect(markdown).not.toContain("- Improved:");
		const remoteMetadata = {
			...results.metadata,
			prNumber: "92",
			headCommit: "1234567890abcdef",
			baseCommit: "abcdef1234567890",
			generatedAt: "2026-08-11T04:25:51.000Z",
			workflowRunUrl: `${results.metadata.repositoryUrl}/actions/runs/123`,
		};
		const remoteHtml = renderHtml({ ...results, metadata: remoteMetadata });
		expect(remoteHtml).toContain('data-i18n="reportDetails"');
		expect(remoteHtml).not.toContain('data-i18n="localReport"');
		expect(remoteHtml).toContain(
			`href="${results.metadata.repositoryUrl}/pull/92"`,
		);
		expect(remoteHtml).toContain(
			'<time datetime="2026-08-11T04:25:51.000Z">2026-08-11 13:25:51 JST</time>',
		);
		for (const commit of [
			remoteMetadata.headCommit,
			remoteMetadata.baseCommit,
			remoteMetadata.baselineCommit,
		]) {
			expect(remoteHtml).toContain(
				`href="${results.metadata.repositoryUrl}/commit/${encodeURIComponent(commit)}"`,
			);
			expect(remoteHtml).toContain(`<code>${commit.slice(0, 7)}</code>`);
		}
		expect(html).toMatch(
			new RegExp(
				`<time datetime="${results.metadata.generatedAt}">` +
					"[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} JST</time>",
			),
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
