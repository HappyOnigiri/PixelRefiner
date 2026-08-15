import { describe, expect, it } from "vitest";
import { createLatestProcessingState } from "./latest-processing-state";

describe("latest processing state", () => {
	it("only lets the latest processing run hide the loading display", () => {
		const state = createLatestProcessingState();
		const first = state.begin();
		const second = state.begin();

		expect(state.finish(first, false)).toBe("stale");
		expect(state.finish(second, false)).toBe("hide-loading");
	});

	it("keeps loading while an auto-process request is scheduled", () => {
		const state = createLatestProcessingState();
		const generation = state.begin();
		state.setAutoProcessScheduled(true);

		expect(state.finish(generation, false)).toBe("keep-loading");
		expect(state.setAutoProcessScheduled(false)).toBe(true);
	});

	it("leaves an externally managed loading display open", () => {
		const state = createLatestProcessingState();
		const generation = state.begin();

		expect(state.finish(generation, true)).toBe("keep-loading");
		expect(state.setAutoProcessScheduled(false)).toBe(false);
	});
});
