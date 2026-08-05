import {
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	assertBaselineUpdateIsSafe,
	baselineFile,
	baselineRoot,
} from "./baseline";
import { runQualityCase, writeQualityBaselineImage } from "./benchmark";
import {
	loadCases,
	qualityProfileFromEnvironment,
	selectCasesForProfile,
	validateManifest,
} from "./manifest";
import { QUALITY_SHARD_COUNT, shardCases } from "./shard";
import { QUALITY_BASELINE_VERSION, type QualityBaseline } from "./types";

const allCases = loadCases();
const profile = qualityProfileFromEnvironment();
const selectedCases = selectCasesForProfile(allCases, profile);
const updateMode = process.env.UPDATE_QUALITY_BASELINE === "1";
const SHARD_ROOT = path.resolve("test/quality/shards");
const SHARD_ENTRY = /runCasesShard\((\d+)\)/;

// [Policy] ベースライン更新はケースを 3 周（判定用に 2 回 + 画像書き出しに 1 回）
// 直列で流すため、シャード実行より長い待機時間を確保する。
const BASELINE_UPDATE_TIMEOUT_MS = 1_800_000;

describe("quality case manifest", () => {
	it("registers every fixture, degradation, and provenance record", () => {
		expect(validateManifest(allCases)).toEqual([]);
	});

	// [Intended] ケース本体は test/quality/shards の各ファイルが並列に実行する。
	// ここでは分配が全ケースをちょうど 1 度ずつ覆い、シャード数とファイル数が
	// ずれていないことを検証する。ずれるとケースが黙って実行されなくなる。
	it("splits every selected case into exactly one shard", () => {
		const shardFiles = readdirSync(SHARD_ROOT)
			.filter((fileName) => fileName.endsWith(".test.ts"))
			.sort();
		expect(shardFiles).toHaveLength(QUALITY_SHARD_COUNT);
		const declaredIndexes = shardFiles.map(
			(fileName) =>
				SHARD_ENTRY.exec(
					readFileSync(path.join(SHARD_ROOT, fileName), "utf8"),
				)?.[1],
		);
		expect(declaredIndexes).toEqual(
			Array.from({ length: QUALITY_SHARD_COUNT }, (_, index) =>
				String(index + 1),
			),
		);
		const buckets = shardCases(selectedCases, QUALITY_SHARD_COUNT);
		const assignedIds = buckets.flat().map((qualityCase) => qualityCase.id);
		expect([...assignedIds].sort()).toEqual(
			selectedCases.map((qualityCase) => qualityCase.id).sort(),
		);
		for (const bucket of buckets) expect(bucket.length).toBeGreaterThan(0);
	});

	it.runIf(updateMode)(
		"updates the stored quality baseline",
		() => {
			assertBaselineUpdateIsSafe(profile);
			// [Intended] 自動判定ケースの指標は既存のベースライン画像を基準に測るため、
			// 画像を書き換える前に全ケースを評価しきる。
			const current: QualityBaseline = {
				version: QUALITY_BASELINE_VERSION,
				commit: process.env.QUALITY_HEAD_SHA ?? "working-tree",
				cases: selectedCases.map((qualityCase) => {
					const result = runQualityCase(qualityCase);
					return {
						id: result.id,
						status: result.status,
						outputWidth: result.metrics.outputWidth,
						outputHeight: result.metrics.outputHeight,
						meanRgbaError: Number(result.metrics.meanRgbaError.toFixed(6)),
						edgeF1: Number(result.metrics.edgeF1.toFixed(6)),
						backgroundMaskIou: Number(
							result.metrics.backgroundMaskIou.toFixed(6),
						),
						smallComponentRetention: Number(
							result.metrics.smallComponentRetention.toFixed(6),
						),
						catastrophicFailure: result.metrics.catastrophicFailure,
					};
				}),
			};
			writeFileSync(baselineFile(), `${JSON.stringify(current, null, 2)}\n`);
			rmSync(baselineRoot(), { recursive: true, force: true });
			mkdirSync(baselineRoot(), { recursive: true });
			for (const qualityCase of selectedCases) {
				writeQualityBaselineImage(
					qualityCase,
					path.join(baselineRoot(), `${qualityCase.id}.png`),
				);
			}
		},
		BASELINE_UPDATE_TIMEOUT_MS,
	);
});
