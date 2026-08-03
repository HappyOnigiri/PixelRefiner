import { describe, expect, it } from "vitest";
import type { ProcessingAnalysis } from "../shared/types";
import { formatProcessingAnalysis } from "./processing-analysis-display";

const analysis = (
	overrides: Partial<ProcessingAnalysis>,
): ProcessingAnalysis => ({
	route: "refine",
	confidence: 0.4,
	warnings: [],
	gridCandidates: [],
	...overrides,
});

const t = (key: string, params?: Record<string, string | number>): string => {
	if (key === "result.analysis") {
		return `${params?.classification}|${params?.route}|${params?.confidence}`;
	}
	return key;
};

describe("formatProcessingAnalysis", () => {
	it("shows automatic classification, route, and classification confidence", () => {
		expect(
			formatProcessingAnalysis(
				analysis({
					classification: "scaled-pixel",
					classificationConfidence: 0.876,
					route: "refine",
				}),
				t,
			),
		).toBe("classification.scaled-pixel|route.refine|88");
	});

	it("uses route confidence for a manually selected route", () => {
		expect(
			formatProcessingAnalysis(
				analysis({ route: "convert", confidence: 0.63 }),
				t,
			),
		).toBe("classification.manual|route.convert|63");
	});

	it("clamps confidence before formatting", () => {
		expect(formatProcessingAnalysis(analysis({ confidence: 3 }), t)).toBe(
			"classification.manual|route.refine|100",
		);
	});
});
