import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	assertBaselineUpdateIsSafe,
	baselineFile,
	baselineRoot,
	loadBaseline,
} from "./baseline";
import { runQualityCase, writeQualityBaselineImage } from "./benchmark";
import { compareMetrics } from "./comparison";
import {
	loadCases,
	qualityProfileFromEnvironment,
	selectCasesForProfile,
	validateManifest,
} from "./manifest";
import { QUALITY_BASELINE_VERSION, type QualityBaseline } from "./types";

const allCases = loadCases();
const profile = qualityProfileFromEnvironment();
const selectedCases = selectCasesForProfile(allCases, profile);
const resultCache = new Map<string, ReturnType<typeof runQualityCase>>();
const getResult = (
	qualityCase: (typeof selectedCases)[number],
): ReturnType<typeof runQualityCase> => {
	const cached = resultCache.get(qualityCase.id);
	if (cached) return cached;
	const result = runQualityCase(qualityCase);
	resultCache.set(qualityCase.id, result);
	return result;
};

describe("quality case manifest", () => {
	it("registers every fixture, degradation, and provenance record", () => {
		expect(validateManifest(allCases)).toEqual([]);
	});

	it.each(selectedCases)(
		"evaluates $id",
		(qualityCase) => {
			const result = getResult(qualityCase);
			expect(result.metrics.byteIdentical).toBe(true);
			expect(result.metrics.catastrophicFailure).toBe(false);
			expect(result.failedAssertions).not.toContain("output-size");
			expect(result.failedAssertions).not.toContain("expected-width");
			expect(result.failedAssertions).not.toContain("expected-height");
		},
		15_000,
	);

	it("does not regress the stored quality baseline", () => {
		const current: QualityBaseline = {
			version: QUALITY_BASELINE_VERSION,
			commit: process.env.QUALITY_HEAD_SHA ?? "working-tree",
			cases: selectedCases.map((qualityCase) => {
				const result = getResult(qualityCase);
				return {
					id: result.id,
					status: result.status,
					outputWidth: result.metrics.outputWidth,
					outputHeight: result.metrics.outputHeight,
					meanRgbaError: Number(result.metrics.meanRgbaError.toFixed(6)),
					edgeF1: Number(result.metrics.edgeF1.toFixed(6)),
					backgroundMaskIou: Number(
						result.metrics.backgroundMaskIou.toFixed(6),
					),
					smallComponentRetention: Number(
						result.metrics.smallComponentRetention.toFixed(6),
					),
					catastrophicFailure: result.metrics.catastrophicFailure,
				};
			}),
		};
		if (process.env.UPDATE_QUALITY_BASELINE === "1") {
			assertBaselineUpdateIsSafe(profile);
			writeFileSync(baselineFile(), `${JSON.stringify(current, null, 2)}\n`);
			rmSync(baselineRoot(), { recursive: true, force: true });
			mkdirSync(baselineRoot(), { recursive: true });
			for (const qualityCase of selectedCases) {
				writeQualityBaselineImage(
					qualityCase,
					path.join(baselineRoot(), `${qualityCase.id}.png`),
				);
			}
			return;
		}
		const baseline = loadBaseline();
		const baselineById = new Map(
			baseline.cases.map((qualityCase) => [qualityCase.id, qualityCase]),
		);
		for (const currentCase of current.cases) {
			const expected = baselineById.get(currentCase.id);
			if (!expected) {
				const result = resultCache.get(currentCase.id);
				expect(result?.status, `${currentCase.id} is a failing new case`).toBe(
					"passed",
				);
				continue;
			}
			expect(currentCase.catastrophicFailure).toBe(false);
			const result = resultCache.get(currentCase.id);
			expect(result).toBeDefined();
			if (!result) continue;
			expect(
				compareMetrics(result.metrics, expected, currentCase.status).regressed,
			).toEqual([]);
		}
	}, 60_000);
});
