import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadBaseline } from "../baseline";
import { reportRoot } from "../benchmark";
import type {
	QualityCaseResult,
	QualityImageCase,
	QualityMetadata,
	QualityResults,
} from "../types";
import { QUALITY_BENCHMARK_VERSION, QUALITY_REPORT_VERSION } from "../types";
import { hasMetricReference } from "./metric-reference";
import { readQualityReportPartials } from "./partial";
import { hasPreviousRun } from "./previous-run";
import { renderCaseDetailHtml, renderHtml, renderMarkdown } from "./render";
import { reportKindFromEnvironment } from "./report-kind";

const metadataFromEnvironment = (): QualityMetadata => {
	const repository =
		process.env.GITHUB_REPOSITORY ?? "HappyOnigiri/PixelRefiner";
	const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
	const runId = process.env.GITHUB_RUN_ID ?? "";
	const previousVersion = process.env.QUALITY_PREVIOUS_VERSION ?? "";
	const baseline = loadBaseline();
	return {
		repositoryUrl: `${server}/${repository}`,
		kind: reportKindFromEnvironment(),
		prNumber: process.env.QUALITY_PR_NUMBER ?? "local",
		previousVersion: previousVersion === "" ? null : previousVersion,
		headCommit:
			process.env.QUALITY_HEAD_SHA ?? process.env.GITHUB_SHA ?? "local",
		baseCommit: process.env.QUALITY_BASE_SHA ?? "local",
		generatedAt: new Date().toISOString(),
		workflowRunUrl:
			runId === "" ? "local" : `${server}/${repository}/actions/runs/${runId}`,
		benchmarkVersion: QUALITY_BENCHMARK_VERSION,
		reportVersion: QUALITY_REPORT_VERSION,
		baselineCommit: baseline.commit,
	};
};

const summarize = (cases: QualityCaseResult[]): QualityResults["summary"] => {
	const count = cases.length;
	const average = (select: (result: QualityCaseResult) => number): number => {
		let total = 0;
		for (const result of cases) total += select(result);
		return count === 0 ? 0 : total / count;
	};
	// [Intended] 基準画像を取得できなかったケースは、指標が自身の出力との比較になり
	// 常に満点で並ぶ。母数へ入れると集計まで満点へ寄るので、基準と比べられたケースだけ
	// を母数にし、1 件も無ければ測定不能として null にする。
	const comparableCases = cases.filter(hasMetricReference);
	const comparableCount = comparableCases.length;
	const comparableAverage = (
		select: (result: QualityCaseResult) => number,
	): number | null => {
		if (comparableCount === 0) return null;
		let total = 0;
		for (const result of comparableCases) total += select(result);
		return total / comparableCount;
	};
	const confidenceSamples = comparableCases.flatMap((result) =>
		result.gridCandidates.map((candidate) => ({
			confidence: candidate.confidence,
			correct: Number(
				candidate.width === result.expectedWidth &&
					candidate.height === result.expectedHeight,
			),
		})),
	);
	const sampleCount = confidenceSamples.length;
	let confidenceTotal = 0;
	let correctnessTotal = 0;
	for (const sample of confidenceSamples) {
		confidenceTotal += sample.confidence;
		correctnessTotal += sample.correct;
	}
	const meanConfidence = sampleCount === 0 ? 0 : confidenceTotal / sampleCount;
	const meanCorrectness =
		sampleCount === 0 ? 0 : correctnessTotal / sampleCount;
	let covariance = 0;
	let confidenceVariance = 0;
	let correctnessVariance = 0;
	for (const sample of confidenceSamples) {
		const confidenceDelta = sample.confidence - meanConfidence;
		const correctnessDelta = sample.correct - meanCorrectness;
		covariance += confidenceDelta * correctnessDelta;
		confidenceVariance += confidenceDelta * confidenceDelta;
		correctnessVariance += correctnessDelta * correctnessDelta;
	}
	const correlationDenominator = Math.sqrt(
		confidenceVariance * correctnessVariance,
	);
	return {
		caseCount: count,
		passed: cases.filter((result) => result.status === "passed").length,
		failed: cases.filter((result) => result.status === "failed").length,
		changed: cases.filter((result) => result.changeStatus === "changed").length,
		unchanged: cases.filter((result) => result.changeStatus === "unchanged")
			.length,
		newCases: cases.filter((result) => result.changeStatus === "new").length,
		explicitCases: cases.filter((result) => result.parameterMode === "explicit")
			.length,
		autoCases: cases.filter((result) => result.parameterMode === "auto").length,
		targetMet: cases.filter((result) => result.targetStatus === "met").length,
		targetUnmet: cases.filter((result) => result.targetStatus === "unmet")
			.length,
		targetMissing: cases.filter((result) => result.targetStatus === "missing")
			.length,
		comparableCases: comparableCount,
		top1SizeAccuracy: comparableAverage((result) =>
			Number(result.metrics.sizeCorrect),
		),
		top3SizeAccuracy: comparableAverage((result) =>
			Number(result.metrics.top3SizeCorrect),
		),
		confidenceCorrectnessCorrelation:
			correlationDenominator === 0 ? null : covariance / correlationDenominator,
		// 出力の再現性は基準画像に依らないので、全ケースを母数にする。
		byteIdentityRate: average((result) => Number(result.metrics.byteIdentical)),
		catastrophicFailureRate: comparableAverage((result) =>
			Number(result.metrics.catastrophicFailure),
		),
		meanRgbaError: comparableAverage((result) => result.metrics.meanRgbaError),
		meanRuntimeMs: average((result) => result.metrics.runtimeMs),
		approxPeakBytes: Math.max(
			0,
			...cases.map((result) => result.metrics.approxPeakBytes),
		),
	};
};

/**
 * シャードが書き出した部分結果を突き合わせ、results.json とレポート HTML を生成する。
 * ケースの実処理は行わないので、シャード実行のあとに 1 プロセスで呼ぶ。
 */
export const aggregateQualityReport = (
	cases: QualityImageCase[],
): QualityResults => {
	const collected = new Map(
		readQualityReportPartials().map((result) => [result.id, result]),
	);
	// [Intended] 集めた結果はケース定義の順序へ戻す。シャードの完了順に並べると
	// results.json とレポートの並びが実行ごとに変わり、差分比較ができなくなる。
	const caseResults: QualityCaseResult[] = [];
	const missing: string[] = [];
	for (const qualityCase of cases) {
		const result = collected.get(qualityCase.id);
		if (result === undefined) missing.push(qualityCase.id);
		else caseResults.push(result);
	}
	if (missing.length > 0) {
		throw new Error(
			`Quality shard results are missing ${missing.length} case(s): ${missing.join(", ")}`,
		);
	}
	const results: QualityResults = {
		metadata: metadataFromEnvironment(),
		summary: summarize(caseResults),
		cases: caseResults,
	};
	mkdirSync(reportRoot, { recursive: true });
	writeFileSync(
		path.join(reportRoot, "results.json"),
		`${JSON.stringify(results, null, 2)}\n`,
	);
	writeFileSync(path.join(reportRoot, "summary.md"), renderMarkdown(results));
	writeFileSync(path.join(reportRoot, "index.html"), renderHtml(results));
	// [Intended] 前回生成の有無はレポート全体で 1 つに決める。ケースごとに判定すると、
	// 初登場のケースだけ前回比較の欄が消えて、他のケースと形の違う詳細ページになる。
	const previousRunAvailable = hasPreviousRun(results);
	for (const result of results.cases) {
		const caseDirectory = path.join(reportRoot, "cases", result.id);
		mkdirSync(caseDirectory, { recursive: true });
		writeFileSync(
			path.join(caseDirectory, "index.html"),
			renderCaseDetailHtml(result, previousRunAvailable, results.metadata.kind),
		);
	}
	return results;
};
