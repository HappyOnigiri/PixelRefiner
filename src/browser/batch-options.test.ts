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

		const autoResult = createBatchItemOptions(
			{ processingMode: "auto", forcePixelsW: 8, forcePixelsH: 8 },
			{
				id: "auto-result:46x13:0",
				kind: "auto-result",
				recommended: true,
				processingMode: "auto",
				outW: 46,
				outH: 13,
			},
		);
		expect(autoResult).toMatchObject({ processingMode: "auto" });
		expect(autoResult.forcePixelsW).toBeUndefined();
		expect(autoResult.forcePixelsH).toBeUndefined();
	});

	it("derives Advanced dithering only from its reduction mode", () => {
		expect(isDitherSettingsEnabled("none")).toBe(false);
		expect(isDitherSettingsEnabled("auto")).toBe(true);
	});
});
