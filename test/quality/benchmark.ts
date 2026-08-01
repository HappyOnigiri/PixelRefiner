import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { processImage } from "../../src/core/processor";
import { imagesEqual, readPng, writePng } from "./image";
import {
	calculateMetrics,
	createBackgroundMaskImage,
	createDiffImage,
} from "./metrics";
import type {
	QualityCaseResult,
	QualityImageCase,
	QualityMetadata,
	QualityResults,
} from "./types";

const REPORT_ROOT = path.resolve("tmp/quality-report/latest");

const metadataFromEnvironment = (): QualityMetadata => {
	const repository =
		process.env.GITHUB_REPOSITORY ?? "HappyOnigiri/PixelRefiner";
	const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
	const runId = process.env.GITHUB_RUN_ID ?? "";
	return {
		prNumber: process.env.QUALITY_PR_NUMBER ?? "local",
		headCommit:
			process.env.QUALITY_HEAD_SHA ?? process.env.GITHUB_SHA ?? "local",
		baseCommit: process.env.QUALITY_BASE_SHA ?? "local",
		generatedAt: new Date().toISOString(),
		workflowRunUrl:
			runId === "" ? "local" : `${server}/${repository}/actions/runs/${runId}`,
		benchmarkVersion: "1",
		reportVersion: "1",
	};
};

const failedAssertions = (
	qualityCase: QualityImageCase,
	result: ReturnType<typeof calculateMetrics>,
	actualMatchesExpected: boolean,
): string[] => {
	const failed: string[] = [];
	const expectation = qualityCase.expectation;
	if (expectation.exact && !actualMatchesExpected)
		failed.push("exact-image-match");
	if (
		expectation.maxMeanRgbaError !== undefined &&
		result.meanRgbaError > expectation.maxMeanRgbaError
	) {
		failed.push("mean-rgba-error");
	}
	if (
		expectation.minEdgeF1 !== undefined &&
		result.edgeF1 < expectation.minEdgeF1
	) {
		failed.push("edge-f1");
	}
	if (
		expectation.minBackgroundMaskIou !== undefined &&
		result.backgroundMaskIou < expectation.minBackgroundMaskIou
	) {
		failed.push("background-mask-iou");
	}
	if (
		expectation.minSmallComponentRetention !== undefined &&
		result.smallComponentRetention < expectation.minSmallComponentRetention
	) {
		failed.push("small-component-retention");
	}
	if (
		expectation.expectedWidth !== undefined &&
		result.outputWidth !== expectation.expectedWidth
	) {
		failed.push("expected-width");
	}
	if (
		expectation.expectedHeight !== undefined &&
		result.outputHeight !== expectation.expectedHeight
	) {
		failed.push("expected-height");
	}
	if (!result.byteIdentical) failed.push("deterministic-output");
	if (result.catastrophicFailure) failed.push("catastrophic-failure");
	return failed;
};

export const runQualityCase = (
	qualityCase: QualityImageCase,
	writeArtifacts = false,
): QualityCaseResult => {
	const inputPath = path.resolve(qualityCase.input);
	const expectedPath = path.resolve(qualityCase.expected);
	const input = readPng(inputPath);
	const expected = readPng(expectedPath);
	const options = { ...qualityCase.options, debug: false };

	const legacyStart = performance.now();
	const legacyRun = processImage(input, options);
	const legacyRuntime = performance.now() - legacyStart;
	const start = performance.now();
	const currentRun = processImage(input, options);
	const runtime = performance.now() - start;
	const repeatRun = processImage(input, options);

	const metrics = calculateMetrics(
		currentRun.result,
		input,
		expected,
		currentRun.grid,
		repeatRun.result,
		runtime,
	);
	const legacyMetrics = calculateMetrics(
		legacyRun.result,
		input,
		expected,
		legacyRun.grid,
		currentRun.result,
		legacyRuntime,
	);
	const failed = failedAssertions(
		qualityCase,
		metrics,
		imagesEqual(currentRun.result, expected),
	);
	const caseDirectory = `cases/${qualityCase.id}`;
	const files = {
		groundTruth: `${caseDirectory}/ground-truth.png`,
		input: `${caseDirectory}/input.png`,
		legacy: `${caseDirectory}/legacy.png`,
		result: `${caseDirectory}/result.png`,
		diff: `${caseDirectory}/diff.png`,
		legacyDiff: `${caseDirectory}/legacy-diff.png`,
		backgroundMask: `${caseDirectory}/background-mask.png`,
	};
	if (writeArtifacts) {
		const outputDirectory = path.join(REPORT_ROOT, caseDirectory);
		mkdirSync(outputDirectory, { recursive: true });
		cpSync(expectedPath, path.join(REPORT_ROOT, files.groundTruth));
		cpSync(inputPath, path.join(REPORT_ROOT, files.input));
		writePng(path.join(REPORT_ROOT, files.legacy), legacyRun.result);
		writePng(path.join(REPORT_ROOT, files.result), currentRun.result);
		writePng(
			path.join(REPORT_ROOT, files.diff),
			createDiffImage(currentRun.result, expected),
		);
		writePng(
			path.join(REPORT_ROOT, files.legacyDiff),
			createDiffImage(currentRun.result, legacyRun.result),
		);
		writePng(
			path.join(REPORT_ROOT, files.backgroundMask),
			createBackgroundMaskImage(currentRun.result),
		);
	}
	return {
		id: qualityCase.id,
		featureIds: qualityCase.featureIds,
		inputKind: qualityCase.inputKind,
		degradationPatterns: qualityCase.degradationPatterns,
		status: failed.length === 0 ? "passed" : "failed",
		failedAssertions: failed,
		classification: qualityCase.inputKind,
		route:
			qualityCase.options.enableGridDetection === false ? "preserve" : "refine",
		confidence: null,
		warnings: failed,
		gridCandidates: [currentRun.grid, ...(currentRun.grid.candidates ?? [])]
			.slice(0, 3)
			.map((candidate) => ({
				width: candidate.outW ?? null,
				height: candidate.outH ?? null,
				score: candidate.score,
			})),
		options: qualityCase.options,
		metrics,
		legacyMetrics,
		files,
	};
};

const summarize = (cases: QualityCaseResult[]): QualityResults["summary"] => {
	const count = cases.length;
	const sum = (select: (result: QualityCaseResult) => number): number => {
		let total = 0;
		for (const result of cases) total += select(result);
		return count === 0 ? 0 : total / count;
	};
	return {
		caseCount: count,
		passed: cases.filter((result) => result.status === "passed").length,
		failed: cases.filter((result) => result.status === "failed").length,
		top1SizeAccuracy: sum((result) => Number(result.metrics.sizeCorrect)),
		top3SizeAccuracy: sum((result) => Number(result.metrics.top3SizeCorrect)),
		byteIdentityRate: sum((result) => Number(result.metrics.byteIdentical)),
		catastrophicFailureRate: sum((result) =>
			Number(result.metrics.catastrophicFailure),
		),
		meanRgbaError: sum((result) => result.metrics.meanRgbaError),
		meanRuntimeMs: sum((result) => result.metrics.runtimeMs),
		approxPeakBytes: Math.max(
			0,
			...cases.map((result) => result.metrics.approxPeakBytes),
		),
	};
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const renderHtml = (results: QualityResults): string => {
	const cards = results.cases
		.map((result) => {
			const searchable = [
				result.status,
				result.inputKind,
				result.route,
				...result.warnings,
				...result.degradationPatterns,
			].join(" ");
			const images = [
				["Ground truth", result.files.groundTruth],
				["Input", result.files.input],
				["Legacy", result.files.legacy],
				["Result", result.files.result],
				["Ground-truth difference", result.files.diff],
				["Legacy difference", result.files.legacyDiff],
				["Background mask", result.files.backgroundMask],
			]
				.map(
					([label, source]) =>
						`<figure><figcaption>${label}</figcaption><img src="${source}" alt="${label}"></figure>`,
				)
				.join("");
			return `<article class="case ${result.status}" data-search="${escapeHtml(searchable)}">
			<h2>${escapeHtml(result.id)} <span>${result.status}</span></h2>
			<div class="images">${images}</div>
			<dl><dt>Input kind</dt><dd>${escapeHtml(result.inputKind)}</dd><dt>Route</dt><dd>${result.route}</dd><dt>Confidence</dt><dd>not available</dd><dt>Warnings</dt><dd>${escapeHtml(result.warnings.join(", ") || "none")}</dd><dt>Top candidates</dt><dd><code>${escapeHtml(JSON.stringify(result.gridCandidates))}</code></dd><dt>Metrics</dt><dd><code>${escapeHtml(JSON.stringify(result.metrics))}</code></dd><dt>Options</dt><dd><code>${escapeHtml(JSON.stringify(result.options))}</code></dd></dl>
		</article>`;
		})
		.join("\n");
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PixelRefiner quality report</title><style>
	:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#15131a;color:#f4efff}body{margin:0 auto;max-width:1500px;padding:24px}header{position:sticky;top:0;background:#15131ae8;padding:12px 0;z-index:2}input,select{padding:8px;margin-right:8px;background:#25212d;color:inherit;border:1px solid #635a70}.case{border:1px solid #494151;border-radius:8px;padding:16px;margin:16px 0}.case.failed{border-color:#ff6b6b}.case h2 span{font-size:.7em}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.images figure{margin:0}.images img{width:100%;height:220px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#bbb 0 25%,#eee 0 50%) 50%/16px 16px}dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 12px}dd{margin:0;overflow-wrap:anywhere}code{font-size:.8em}</style></head><body>
	<header><h1>PixelRefiner quality report</h1><p>PR ${escapeHtml(results.metadata.prNumber)} &middot; head ${escapeHtml(results.metadata.headCommit)} &middot; base ${escapeHtml(results.metadata.baseCommit)} &middot; ${escapeHtml(results.metadata.generatedAt)} &middot; <a href="${escapeHtml(results.metadata.workflowRunUrl)}">workflow</a> &middot; benchmark v${results.metadata.benchmarkVersion} &middot; report v${results.metadata.reportVersion}</p><input id="search" placeholder="Filter cases"><select id="status"><option value="">All statuses</option><option>passed</option><option>failed</option></select></header>
	<main>${cards}</main><script>const q=document.querySelector('#search'),s=document.querySelector('#status'),cards=[...document.querySelectorAll('.case')];function filter(){const text=q.value.toLowerCase(),status=s.value;for(const card of cards){card.hidden=!(card.dataset.search.toLowerCase().includes(text)&&(!status||card.classList.contains(status)))}}q.addEventListener('input',filter);s.addEventListener('change',filter);</script></body></html>`;
};

const renderMarkdown = (results: QualityResults): string => {
	const summary = results.summary;
	const rows = results.cases
		.map(
			(result) =>
				`|${result.id}|${result.status}|${result.metrics.outputWidth}x${result.metrics.outputHeight}|${result.metrics.meanRgbaError.toFixed(3)}|${result.metrics.edgeF1.toFixed(3)}|${result.metrics.runtimeMs.toFixed(2)}|`,
		)
		.join("\n");
	return `# PixelRefiner quality report\n\n- Cases: ${summary.caseCount}\n- Passed: ${summary.passed}\n- Failed: ${summary.failed}\n- Top-1 size accuracy: ${(summary.top1SizeAccuracy * 100).toFixed(1)}%\n- Top-3 size accuracy: ${(summary.top3SizeAccuracy * 100).toFixed(1)}%\n- Catastrophic failure rate: ${(summary.catastrophicFailureRate * 100).toFixed(1)}%\n\n|Case|Status|Output|Mean RGBA error|Edge F1|Runtime (ms)|\n|---|---|---:|---:|---:|---:|\n${rows}\n`;
};

export const generateQualityReport = (
	cases: QualityImageCase[],
): QualityResults => {
	rmSync(REPORT_ROOT, { recursive: true, force: true });
	mkdirSync(REPORT_ROOT, { recursive: true });
	const caseResults = cases.map((qualityCase) =>
		runQualityCase(qualityCase, true),
	);
	const results: QualityResults = {
		metadata: metadataFromEnvironment(),
		summary: summarize(caseResults),
		cases: caseResults,
	};
	writeFileSync(
		path.join(REPORT_ROOT, "results.json"),
		`${JSON.stringify(results, null, 2)}\n`,
	);
	writeFileSync(path.join(REPORT_ROOT, "summary.md"), renderMarkdown(results));
	writeFileSync(path.join(REPORT_ROOT, "index.html"), renderHtml(results));
	return results;
};

export const reportRoot = REPORT_ROOT;
