import { describe, expect, it } from "vitest";
import { migrateSmallComponentMode } from "./preset-controls";

describe("small-component preset migration", () => {
	it("maps a disabled legacy percentage to Off", () => {
		const state = { "floating-max-percent": 0 };

		migrateSmallComponentMode(state);

		expect(state).toMatchObject({ "small-component-mode": "off" });
	});

	it("maps a positive legacy percentage to Auto", () => {
		const state = { "floating-max-percent-slider": 3 };

		migrateSmallComponentMode(state);

		expect(state).toMatchObject({ "small-component-mode": "auto" });
	});

	it("does not replace a saved new mode", () => {
		const state = {
			"small-component-mode": "light",
			"floating-max-percent": 3,
		};

		migrateSmallComponentMode(state);

		expect(state["small-component-mode"]).toBe("light");
	});
});
