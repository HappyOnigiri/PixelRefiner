import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runQualityCase } from "./benchmark";
import { loadCases, validateManifest } from "./manifest";

type BaselineCase = {
	id: string;
	meanRgbaError: number;
	edgeF1: number;
	backgroundMaskIou: number;
	smallComponentRetention: number;
	catastrophicFailure: boolean;
};

type QualityBaseline = {
	version: number;
	commit: string;
	cases: BaselineCase[];
};

const allCases = loadCases();
const profile = process.env.QUALITY_PROFILE ?? "smoke";
const selectedCases = allCases.filter(
	(qualityCase) => profile === "full" || qualityCase.profile === "smoke",
);
const baselinePath = path.resolve("test/quality/baseline.json");
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
			if (qualityCase.expectation.exact) {
				expect(result.failedAssertions).not.toContain("exact-image-match");
			}
		},
		15_000,
	);

	it("does not regress the stored quality baseline", () => {
		const current: QualityBaseline = {
			version: 1,
			commit: process.env.QUALITY_HEAD_SHA ?? "working-tree",
			cases: selectedCases.map((qualityCase) => {
				const result = getResult(qualityCase);
				return {
					id: result.id,
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
			writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
			return;
		}
		expect(existsSync(baselinePath)).toBe(true);
		const baseline = JSON.parse(
			readFileSync(baselinePath, "utf8"),
		) as QualityBaseline;
		const baselineById = new Map(
			baseline.cases.map((qualityCase) => [qualityCase.id, qualityCase]),
		);
		for (const currentCase of current.cases) {
			const expected = baselineById.get(currentCase.id);
			expect(expected, `Missing baseline for ${currentCase.id}`).toBeDefined();
			if (!expected) continue;
			expect(currentCase.catastrophicFailure).toBe(false);
			expect(currentCase.meanRgbaError).toBeLessThanOrEqual(
				expected.meanRgbaError + 0.01,
			);
			expect(currentCase.edgeF1).toBeGreaterThanOrEqual(
				expected.edgeF1 - 0.001,
			);
			expect(currentCase.backgroundMaskIou).toBeGreaterThanOrEqual(
				expected.backgroundMaskIou - 0.001,
			);
			expect(currentCase.smallComponentRetention).toBeGreaterThanOrEqual(
				expected.smallComponentRetention - 0.001,
			);
		}
	});
});
