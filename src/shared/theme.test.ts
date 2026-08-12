import { describe, expect, it } from "vitest";
import { resolveColorTheme } from "./theme";

describe("resolveColorTheme", () => {
	it("prioritizes a saved theme over the OS preference", () => {
		expect(resolveColorTheme("light", true)).toBe("light");
		expect(resolveColorTheme("dark", false)).toBe("dark");
	});

	it("uses the OS preference when no valid theme is saved", () => {
		expect(resolveColorTheme(null, true)).toBe("dark");
		expect(resolveColorTheme("unknown", true)).toBe("dark");
	});

	it("falls back to light when a dark preference cannot be detected", () => {
		expect(resolveColorTheme(null, false)).toBe("light");
		expect(resolveColorTheme("unknown", false)).toBe("light");
	});
});
