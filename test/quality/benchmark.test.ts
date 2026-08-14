import { describe, expect, it } from "vitest";
import { generateQualityBaseline } from "./benchmark";
import type { QualityImageCase } from "./types";

const autoCase: QualityImageCase = {
	id: "auto-baseline-update-test",
	featureIds: ["PRF-400"],
	profile: "smoke",
	parameterMode: "auto",
	inputKind: "unclassified",
	degradationPatterns: [],
	options: {},
	input: "test/fixtures/quality_reference.png",
	assertions: ["deterministic-output"],
	expectation: {},
	assets: [],
};

describe("quality baseline generation", () => {
	it("stores auto metrics against the newly generated image", () => {
		const generated = generateQualityBaseline(autoCase);
		expect(generated.entry).toMatchObject({
			id: autoCase.id,
			status: "passed",
			outputWidth: generated.image.width,
			outputHeight: generated.image.height,
			meanRgbaError: 0,
			edgeF1: 1,
			backgroundMaskIou: 1,
			smallComponentRetention: 1,
			catastrophicFailure: false,
		});
	});
});
