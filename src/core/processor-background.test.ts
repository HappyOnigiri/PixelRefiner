import { describe, expect, it } from "vitest";
import type {
	BackgroundDiagnostic,
	BackgroundRemovalStageOutcome,
} from "../shared/types";
import { applyPostRemovalOutcome } from "./processor-background";

const diagnostic = (
	preRemoval: BackgroundRemovalStageOutcome,
): BackgroundDiagnostic => ({
	confidence: 0.9,
	removalRolledBack: preRemoval.rolledBack,
	preRemoval,
});

describe("applyPostRemovalOutcome", () => {
	it("reports a rollback only when every applied stage rolled back", () => {
		const both = diagnostic({ attempted: true, rolledBack: true });
		applyPostRemovalOutcome(both, { attempted: true, rolledBack: true });

		expect(both.removalRolledBack).toBe(true);
	});

	it("clears a full-resolution rollback when the post-processing removal succeeds", () => {
		const preOnly = diagnostic({ attempted: true, rolledBack: true });
		applyPostRemovalOutcome(preOnly, { attempted: true, rolledBack: false });

		expect(preOnly.removalRolledBack).toBe(false);
	});

	it("keeps the transparency made by the pre-processing removal out of the warning", () => {
		const postOnly = diagnostic({ attempted: true, rolledBack: false });
		applyPostRemovalOutcome(postOnly, { attempted: true, rolledBack: true });

		expect(postOnly.removalRolledBack).toBe(false);
	});

	it("uses the remaining stage when the pre-processing removal is disabled", () => {
		const rolledBack = diagnostic({ attempted: false, rolledBack: false });
		applyPostRemovalOutcome(rolledBack, { attempted: true, rolledBack: true });

		expect(rolledBack.removalRolledBack).toBe(true);

		const removed = diagnostic({ attempted: false, rolledBack: false });
		applyPostRemovalOutcome(removed, { attempted: true, rolledBack: false });

		expect(removed.removalRolledBack).toBe(false);
	});

	it("reports no rollback when no removal stage runs", () => {
		const none = diagnostic({ attempted: false, rolledBack: false });
		applyPostRemovalOutcome(none, { attempted: false, rolledBack: false });

		expect(none.removalRolledBack).toBe(false);
	});
});
