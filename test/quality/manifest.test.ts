import { afterEach, describe, expect, it, vi } from "vitest";
import {
	loadCases,
	qualityCaseDirectory,
	qualityProfileFromEnvironment,
	selectCasesForProfile,
	validateManifest,
} from "./manifest";
import type { QualityImageCase } from "./types";

const cases = loadCases();
const cloneCases = (): QualityImageCase[] => structuredClone(cases);

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("quality manifest", () => {
	it("accepts the checked-in manifest", () => {
		expect(validateManifest(cases)).toEqual([]);
	});

	it.each([
		{
			name: "duplicate IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[1].id = draft[0].id;
			},
			error: "Duplicate case ID:",
		},
		{
			name: "unsafe IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].id = "unsafe/id";
			},
			error: "case ID must contain lowercase letters",
		},
		{
			name: "provenance-oriented IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].id = "generated-case";
			},
			error: "case ID must describe behavior",
		},
		{
			name: "empty feature IDs",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].featureIds = [];
			},
			error: "featureIds must not be empty",
		},
		{
			name: "empty assertions",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].assertions = [];
			},
			error: "assertions must not be empty",
		},
		{
			name: "metric allowances on exact cases",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].expectation.minEdgeF1 = 1;
			},
			error: "exact cases must not use metric allowances",
		},
		{
			name: "missing thresholds on lossy cases",
			mutate: (draft: QualityImageCase[]) => {
				const lossy = draft.find((item) => !item.expectation.exact);
				if (!lossy) throw new Error("Lossy case not found");
				delete lossy.expectation.minEdgeF1;
			},
			error: "non-exact case requires minEdgeF1",
		},
		{
			name: "missing asset provenance",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].assets = [];
			},
			error: "missing provenance",
		},
		{
			name: "unusable asset terms",
			mutate: (draft: QualityImageCase[]) => {
				draft[0].assets[0].redistributionAllowed = false;
			},
			error: "unusable asset terms",
		},
	])("rejects $name", ({ mutate, error }) => {
		const draft = cloneCases();
		mutate(draft);
		expect(
			validateManifest(draft).some((message) => message.includes(error)),
		).toBe(true);
	});

	it("uses one validated profile selector for smoke and full runs", () => {
		expect(selectCasesForProfile(cases, "smoke")).toHaveLength(
			cases.filter((qualityCase) => qualityCase.profile === "smoke").length,
		);
		expect(selectCasesForProfile(cases, "full")).toHaveLength(cases.length);
		vi.stubEnv("QUALITY_PROFILE", "invalid");
		expect(() => qualityProfileFromEnvironment()).toThrow(
			"Unsupported quality profile",
		);
	});

	it("uses safe case IDs as report directory names", () => {
		expect(qualityCaseDirectory("restore-nearest-2x")).toBe(
			"cases/restore-nearest-2x",
		);
		expect(() => qualityCaseDirectory("../unsafe")).toThrow(
			"Unsafe quality case ID",
		);
	});
});
