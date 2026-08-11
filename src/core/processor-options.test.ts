import { describe, expect, it } from "vitest";
import { normalizeProcessOptions } from "./processor-options";

describe("small-component options", () => {
	it("disables alpha-aware medoid sampling for new callers", () => {
		const options = normalizeProcessOptions({});

		expect(options.cellSamplingMode).toBe("hard-alpha-medoid");
	});

	it("uses Auto for new callers", () => {
		const options = normalizeProcessOptions({});

		expect(options.smallComponentMode).toBe("auto");
		expect(options.geminiWatermarkRemoval).toBe("auto");
		expect(options.floatingMaxPixels).toBe(0);
	});

	it("keeps the explicit legacy pixel threshold", () => {
		const options = normalizeProcessOptions({ floatingMaxPixels: 7 });

		expect(options.smallComponentMode).toBe("off");
		expect(options.floatingMaxPixels).toBe(7);
	});

	it("prefers an explicit new mode when both forms are present", () => {
		const options = normalizeProcessOptions({
			smallComponentMode: "strong",
			floatingMaxPixels: 7,
		});

		expect(options.smallComponentMode).toBe("strong");
		expect(options.floatingMaxPixels).toBe(0);
	});
});
