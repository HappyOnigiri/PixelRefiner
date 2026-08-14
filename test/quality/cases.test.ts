import {
	cpSync,
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
import {
	loadCases,
	qualityProfileFromEnvironment,
	selectCasesForProfile,
	validateManifest,
} from "./manifest";
import { QUALITY_SHARD_COUNT, shardCases } from "./shard";
import { QUALITY_BASELINE_VERSION, type QualityBaseline } from "./types";
import {
	readQualityUpdatePartials,
	stagingBaselineImagePath,
} from "./update/partial";

const allCases = loadCases();
const profile = qualityProfileFromEnvironment();
const selectedCases = selectCasesForProfile(allCases, profile);
const updateMode = process.env.UPDATE_QUALITY_BASELINE === "1";
const SHARD_ROOT = path.resolve("test/quality/shards");
const SHARD_ENTRY = /runCasesShard\((\d+)\)/;

// [Policy] ここはベースライン更新の stage2（集約・書き込み専用）。ケース本体の実行は
// test/quality/shards が並列に済ませ、tmp/quality-baseline-update へ結果を書き出す
// （"pnpm run quality:update:generate"）。ここは集約と書き込みだけなので短い待機時間で足りる。
const BASELINE_UPDATE_TIMEOUT_MS = 120_000;

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
			// [Intended] stage1（並列生成）は各ケースの新しい出力画像と、その画像を基準に
			// 測った指標をステージング領域へ書き出している。ここで集約してから追跡ファイルへ
			// 一括で書くことで、画像と baseline.json が必ず同じ生成結果で揃う。
			const entryById = new Map(
				readQualityUpdatePartials().map((entry) => [entry.id, entry]),
			);
			const missingIds = selectedCases
				.map((qualityCase) => qualityCase.id)
				.filter((id) => !entryById.has(id));
			if (missingIds.length > 0) {
				throw new Error(
					`Missing staged baseline update for ${missingIds.length} case(s): ` +
						`${missingIds.join(", ")}. Run "pnpm run quality:update:generate" first.`,
				);
			}
			const current: QualityBaseline = {
				version: QUALITY_BASELINE_VERSION,
				commit: process.env.QUALITY_HEAD_SHA ?? "working-tree",
				cases: selectedCases.map((qualityCase) => {
					const entry = entryById.get(qualityCase.id);
					if (entry === undefined) {
						throw new Error(`unreachable: missing entry for ${qualityCase.id}`);
					}
					return entry;
				}),
			};
			const nextBaselineFile = baselineFile();
			const nextBaselineRoot = baselineRoot();
			writeFileSync(nextBaselineFile, `${JSON.stringify(current, null, 2)}\n`);
			rmSync(nextBaselineRoot, { recursive: true, force: true });
			mkdirSync(nextBaselineRoot, { recursive: true });
			for (const qualityCase of selectedCases) {
				cpSync(
					stagingBaselineImagePath(qualityCase.id),
					path.join(nextBaselineRoot, `${qualityCase.id}.png`),
				);
			}
		},
		BASELINE_UPDATE_TIMEOUT_MS,
	);
});
