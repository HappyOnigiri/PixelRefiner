import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	assertBaselineUpdateIsSafe,
	isBaselineImageDeclaredUpdated,
	loadBaseline,
} from "./baseline";
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

describe("isBaselineImageDeclaredUpdated", () => {
	// [Intended] head 側の実ファイル（test/quality/baseline/auto-resize-with-trimming.png）を基準に、
	// 「PR ベース時点の旧ベースライン」役の一時ディレクトリを組み立てて比較する。
	const caseId = "auto-resize-with-trimming";
	const headBytes = readFileSync(
		path.resolve("test/quality/baseline", `${caseId}.png`),
	);
	let directory: string;

	afterEach(() => {
		if (directory) rmSync(directory, { recursive: true, force: true });
	});

	it("returns false when QUALITY_BASELINE_ROOT is unset (local runs)", () => {
		expect(isBaselineImageDeclaredUpdated(caseId)).toBe(false);
	});

	it("returns false when the old baseline image is byte-identical to head", () => {
		directory = mkdtempSync(path.join(tmpdir(), "pixel-refiner-old-baseline-"));
		writeFileSync(path.join(directory, `${caseId}.png`), headBytes);
		vi.stubEnv("QUALITY_BASELINE_ROOT", directory);
		expect(isBaselineImageDeclaredUpdated(caseId)).toBe(false);
	});

	it("returns true when head updated the baseline image (declared change)", () => {
		directory = mkdtempSync(path.join(tmpdir(), "pixel-refiner-old-baseline-"));
		const mutated = Buffer.from(headBytes);
		mutated[mutated.length - 1] ^= 0xff;
		writeFileSync(path.join(directory, `${caseId}.png`), mutated);
		vi.stubEnv("QUALITY_BASELINE_ROOT", directory);
		expect(isBaselineImageDeclaredUpdated(caseId)).toBe(true);
	});

	it("returns true when the case has no old baseline image at all (new case)", () => {
		directory = mkdtempSync(path.join(tmpdir(), "pixel-refiner-old-baseline-"));
		vi.stubEnv("QUALITY_BASELINE_ROOT", directory);
		expect(isBaselineImageDeclaredUpdated(caseId)).toBe(true);
	});
});
