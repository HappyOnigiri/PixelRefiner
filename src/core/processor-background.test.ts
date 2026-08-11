import { describe, expect, it } from "vitest";
import type {
	BackgroundDiagnostic,
	BackgroundRemovalStageOutcome,
} from "../shared/types";
import { applyPostRemovalOutcome } from "./processor-background";

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

const diagnostic = (
	preRemoval: BackgroundRemovalStageOutcome,
): BackgroundDiagnostic => ({
	confidence: 0.9,
	removalRolledBack: preRemoval.rolledBack,
	preRemoval,
});

describe("applyPostRemovalOutcome", () => {
	it("reports a rollback only when every applied stage rolled back", () => {
		const both = diagnostic(rolledBack);
		applyPostRemovalOutcome(both, rolledBack);

		expect(both.removalRolledBack).toBe(true);
	});

	it("clears a full-resolution rollback when the post-processing removal succeeds", () => {
		const preOnly = diagnostic(rolledBack);
		applyPostRemovalOutcome(preOnly, madeTransparency);

		expect(preOnly.removalRolledBack).toBe(false);
	});

	it("keeps the transparency made by the pre-processing removal out of the warning", () => {
		const postOnly = diagnostic(madeTransparency);
		applyPostRemovalOutcome(postOnly, rolledBack);

		expect(postOnly.removalRolledBack).toBe(false);
	});

	it("keeps the rollback when the remaining stage removed nothing", () => {
		const nothingLeft = diagnostic(rolledBack);
		applyPostRemovalOutcome(nothingLeft, removedNothing);

		expect(nothingLeft.removalRolledBack).toBe(true);
	});

	it("uses the remaining stage when the pre-processing removal is disabled", () => {
		const skipped = diagnostic(notApplied);
		applyPostRemovalOutcome(skipped, rolledBack);

		expect(skipped.removalRolledBack).toBe(true);

		const removed = diagnostic(notApplied);
		applyPostRemovalOutcome(removed, madeTransparency);

		expect(removed.removalRolledBack).toBe(false);
	});

	it("reports no rollback when a stage removed nothing without rolling back", () => {
		const idle = diagnostic(removedNothing);
		applyPostRemovalOutcome(idle, notApplied);

		expect(idle.removalRolledBack).toBe(false);
	});

	it("reports no rollback when no removal stage runs", () => {
		const none = diagnostic(notApplied);
		applyPostRemovalOutcome(none, notApplied);

		expect(none.removalRolledBack).toBe(false);
	});
});
