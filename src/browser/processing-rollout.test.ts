import { describe, expect, it, vi } from "vitest";
import { PROCESS_ROLLOUT } from "../shared/config";
import {
	processingModeForPipeline,
	resolveProcessingPipeline,
} from "./processing-rollout";

const storage = (stored: string | null = null) => ({
	getItem: vi.fn(() => stored),
	setItem: vi.fn(),
});

describe("processing rollout", () => {
	it("uses the legacy pipeline by default", () => {
		expect(resolveProcessingPipeline("", storage())).toBe("legacy");
		expect(processingModeForPipeline("legacy")).toBe("refine");
	});

	it("enables and persists the next Auto pipeline from the URL", () => {
		const rolloutStorage = storage();
		expect(resolveProcessingPipeline("?pipeline=next", rolloutStorage)).toBe(
			"next",
		);
		expect(rolloutStorage.setItem).toHaveBeenCalledWith(
			PROCESS_ROLLOUT.storageKey,
			"next",
		);
		expect(processingModeForPipeline("next")).toBe("auto");
	});

	it("uses the persisted pipeline and lets a valid URL override it", () => {
		expect(resolveProcessingPipeline("", storage("next"))).toBe("next");
		expect(resolveProcessingPipeline("?pipeline=legacy", storage("next"))).toBe(
			"legacy",
		);
	});

	it("falls back safely when storage access is rejected", () => {
		const blockedStorage = {
			getItem: vi.fn(() => {
				throw new Error("blocked");
			}),
			setItem: vi.fn(() => {
				throw new Error("blocked");
			}),
		};
		expect(resolveProcessingPipeline("", blockedStorage)).toBe("legacy");
		expect(resolveProcessingPipeline("?pipeline=next", blockedStorage)).toBe(
			"next",
		);
	});
});
