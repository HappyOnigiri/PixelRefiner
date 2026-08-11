import { describe, expect, it } from "vitest";
import type {
	BackgroundDiagnostic,
	BackgroundRemovalStageOutcome,
} from "../shared/types";
import {
	applyPostRemovalOutcome,
	hasSkippedBackgroundRemoval,
} from "./processor-background";

const notApplied: BackgroundRemovalStageOutcome = {
	attempted: false,
	rolledBack: false,
	removed: false,
};
const rolledBack: BackgroundRemovalStageOutcome = {
	attempted: true,
	rolledBack: true,
	removed: false,
};
const madeTransparency: BackgroundRemovalStageOutcome = {
	attempted: true,
	rolledBack: false,
	removed: true,
};
const removedNothing: BackgroundRemovalStageOutcome = {
	attempted: true,
	rolledBack: false,
	removed: false,
};

const skippedAfter = (
	preRemoval: BackgroundRemovalStageOutcome,
	postRemoval: BackgroundRemovalStageOutcome,
): boolean => {
	const diagnostic: BackgroundDiagnostic = { confidence: 0.9, preRemoval };
	applyPostRemovalOutcome(diagnostic, postRemoval);

	expect(diagnostic.postRemoval).toBe(postRemoval);
	return hasSkippedBackgroundRemoval(diagnostic);
};

describe("hasSkippedBackgroundRemoval", () => {
	it("reports a rollback only when every applied stage rolled back", () => {
		expect(skippedAfter(rolledBack, rolledBack)).toBe(true);
	});

	it("clears a full-resolution rollback when the post-processing removal succeeds", () => {
		expect(skippedAfter(rolledBack, madeTransparency)).toBe(false);
	});

	it("keeps the transparency made by the pre-processing removal out of the warning", () => {
		expect(skippedAfter(madeTransparency, rolledBack)).toBe(false);
	});

	it("keeps the rollback when the remaining stage removed nothing", () => {
		expect(skippedAfter(rolledBack, removedNothing)).toBe(true);
	});

	it("uses the remaining stage when the pre-processing removal is disabled", () => {
		expect(skippedAfter(notApplied, rolledBack)).toBe(true);
		expect(skippedAfter(notApplied, madeTransparency)).toBe(false);
	});

	it("reports no rollback when a stage removed nothing without rolling back", () => {
		expect(skippedAfter(removedNothing, notApplied)).toBe(false);
	});

	it("reports no rollback when no removal stage runs", () => {
		expect(skippedAfter(notApplied, notApplied)).toBe(false);
	});

	it("judges by the pre-processing stage alone while the post-processing stage is unrecorded", () => {
		// [Intended] 結論を欄として持たず段階から導くため、事後除去を記録しない経路では
		// 事前除去の結果だけで判定される。古い結論が残ったまま警告になることはない。
		expect(
			hasSkippedBackgroundRemoval({
				confidence: 0.9,
				preRemoval: rolledBack,
			}),
		).toBe(true);
		expect(
			hasSkippedBackgroundRemoval({
				confidence: 0.9,
				preRemoval: madeTransparency,
			}),
		).toBe(false);
	});
});
