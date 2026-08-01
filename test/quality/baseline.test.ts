import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertBaselineUpdateIsSafe, loadBaseline } from "./baseline";
import { QUALITY_BASELINE_VERSION } from "./types";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("quality baseline", () => {
	it("rejects incompatible baseline versions", () => {
		const directory = mkdtempSync(
			path.join(tmpdir(), "pixel-refiner-baseline-"),
		);
		const file = path.join(directory, "baseline.json");
		try {
			writeFileSync(
				file,
				JSON.stringify({ version: QUALITY_BASELINE_VERSION + 1, cases: [] }),
			);
			vi.stubEnv("QUALITY_BASELINE_FILE", file);
			expect(() => loadBaseline()).toThrow(
				"Unsupported quality baseline version",
			);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("allows updates only for the full checked-in baseline", () => {
		expect(() => assertBaselineUpdateIsSafe("smoke")).toThrow(
			"require the full profile",
		);
		expect(() => assertBaselineUpdateIsSafe("full")).not.toThrow();
		vi.stubEnv("QUALITY_BASELINE_ROOT", "/tmp/external-baseline");
		expect(() => assertBaselineUpdateIsSafe("full")).toThrow(
			"cannot use QUALITY_BASELINE_ROOT",
		);
	});
});
