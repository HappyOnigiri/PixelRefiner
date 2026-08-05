import { afterEach, describe, expect, it, vi } from "vitest";
import {
	allowDeclaredAutoChangesFromEnvironment,
	shouldWarnInsteadOfFail,
} from "./gate";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("allowDeclaredAutoChangesFromEnvironment", () => {
	it("is enabled only when the flag is exactly '1'", () => {
		expect(allowDeclaredAutoChangesFromEnvironment()).toBe(false);
		vi.stubEnv("QUALITY_GATE_ALLOW_DECLARED_AUTO_CHANGES", "true");
		expect(allowDeclaredAutoChangesFromEnvironment()).toBe(false);
		vi.stubEnv("QUALITY_GATE_ALLOW_DECLARED_AUTO_CHANGES", "1");
		expect(allowDeclaredAutoChangesFromEnvironment()).toBe(true);
	});
});

describe("shouldWarnInsteadOfFail", () => {
	const base = {
		isAutoCase: true,
		regressedMetrics: ["meanRgbaError"],
		allowDeclaredAutoChanges: true,
		baselineImageDeclaredUpdated: true,
		baselineStatus: "passed" as const,
	};

	it("downgrades a declared auto-case regression to a warning", () => {
		expect(shouldWarnInsteadOfFail(base)).toBe(true);
	});

	it("keeps failing when downgrades are not enabled (local runs)", () => {
		expect(
			shouldWarnInsteadOfFail({ ...base, allowDeclaredAutoChanges: false }),
		).toBe(false);
	});

	it("keeps failing for explicit cases that previously passed", () => {
		expect(shouldWarnInsteadOfFail({ ...base, isAutoCase: false })).toBe(false);
	});

	it("downgrades declared metric tradeoffs for an already-failing explicit case", () => {
		expect(
			shouldWarnInsteadOfFail({
				...base,
				isAutoCase: false,
				baselineStatus: "failed",
			}),
		).toBe(true);
	});

	it("keeps failing when there is no regression to downgrade", () => {
		expect(shouldWarnInsteadOfFail({ ...base, regressedMetrics: [] })).toBe(
			false,
		);
	});

	it("downgrades contextual catastrophic metrics for a declared auto change", () => {
		expect(
			shouldWarnInsteadOfFail({
				...base,
				regressedMetrics: ["meanRgbaError", "catastrophicFailure"],
			}),
		).toBe(true);
	});

	it("keeps failing when the baseline image was not updated on head (undeclared)", () => {
		expect(
			shouldWarnInsteadOfFail({ ...base, baselineImageDeclaredUpdated: false }),
		).toBe(false);
	});
});
