import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	readQualityGateWarningPartials,
	writeQualityGateWarningPartial,
} from "./partial";

// [Intended] 既定の集約先（tmp/quality-gate-warnings）は、同じ vitest run 内で並行実行
// されうる本物のゲートシャード（test/quality/shards）も書き込む共有ディレクトリなので、
// このテストでは衝突を避けるため専用の一時ディレクトリを明示的に渡す。
let directory: string;

afterEach(() => {
	if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("quality gate warning partials", () => {
	it("returns an empty list when no shard has written a partial", () => {
		directory = mkdtempSync(
			path.join(tmpdir(), "pixel-refiner-gate-warnings-"),
		);
		expect(readQualityGateWarningPartials(directory)).toEqual([]);
	});

	it("merges warnings written by multiple shards", () => {
		directory = mkdtempSync(
			path.join(tmpdir(), "pixel-refiner-gate-warnings-"),
		);
		writeQualityGateWarningPartial(
			1,
			[{ id: "auto-case-a", regressedMetrics: ["meanRgbaError"] }],
			directory,
		);
		writeQualityGateWarningPartial(
			2,
			[{ id: "auto-case-b", regressedMetrics: ["edgeF1", "status"] }],
			directory,
		);
		writeQualityGateWarningPartial(3, [], directory);

		expect(readQualityGateWarningPartials(directory)).toEqual([
			{ id: "auto-case-a", regressedMetrics: ["meanRgbaError"] },
			{ id: "auto-case-b", regressedMetrics: ["edgeF1", "status"] },
		]);
	});
});
