import { describe, expect, it } from "vitest";
import {
	createBatchItemOptions,
	isDitherSettingsEnabled,
} from "./batch-options";

describe("batch item options", () => {
	it("keeps automatic options for unconfirmed images", () => {
		const options = { detectionQuantStep: 32 };

		expect(createBatchItemOptions(options, undefined)).toBe(options);
	});

	it("applies each image's confirmed candidate independently", () => {
		const base = { detectionQuantStep: 32 };
		const preserve = createBatchItemOptions(base, {
			id: "preserve",
			kind: "preserve",
			recommended: false,
			processingMode: "preserve",
		});
		const refine = createBatchItemOptions(base, {
			id: "recommended:8x8",
			kind: "recommended",
			recommended: true,
			processingMode: "refine",
			outW: 8,
			outH: 8,
		});

		expect(preserve.processingMode).toBe("preserve");
		expect(refine).toMatchObject({
			processingMode: "refine",
			forcePixelsW: 8,
			forcePixelsH: 8,
		});
	});

	it("keeps dither controls visible for shared-palette processing", () => {
		expect(isDitherSettingsEnabled("none", true)).toBe(true);
		expect(isDitherSettingsEnabled("none", false)).toBe(false);
		expect(isDitherSettingsEnabled("auto", false)).toBe(true);
	});
});
