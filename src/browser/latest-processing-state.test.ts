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

	it("treats only the newest generation as the latest one", () => {
		const state = createLatestProcessingState();
		const first = state.begin();

		expect(state.isLatest(first)).toBe(true);

		const second = state.begin();

		expect(state.isLatest(first)).toBe(false);
		expect(state.isLatest(second)).toBe(true);
	});

	it("leaves the running generation untouched when a stale run finishes", () => {
		const state = createLatestProcessingState();
		const first = state.begin();
		const second = state.begin();

		expect(state.finish(first, true)).toBe("stale");
		// 古い処理の完了は、実行中の判定にも外部管理の保持にも影響しない。
		expect(state.setAutoProcessScheduled(false)).toBe(false);
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
