import { describe, expect, it, vi } from "vitest";
import { failBatchProcessing } from "./batch-state";

describe("batch processing state", () => {
	it("moves every started image out of processing when the worker rejects", () => {
		const setImageStatus = vi.fn();

		const message = failBatchProcessing(
			{ setImageStatus },
			["first", "second"],
			new Error("worker stopped"),
		);

		expect(message).toBe("worker stopped");
		expect(setImageStatus.mock.calls).toEqual([
			["first", "error", "worker stopped"],
			["second", "error", "worker stopped"],
		]);
	});
});
