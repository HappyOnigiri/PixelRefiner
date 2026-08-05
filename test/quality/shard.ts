import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	assertBaselineUpdateIsSafe,
	isBaselineImageDeclaredUpdated,
	loadBaseline,
} from "./baseline";
import {
	runQualityCase,
	toBaselineCaseEntry,
	writeQualityBaselineImage,
} from "./benchmark";
import { compareMetrics } from "./comparison";
import {
	allowDeclaredAutoChangesFromEnvironment,
	shouldWarnInsteadOfFail,
} from "./gate";
import { writeQualityGateWarningPartial } from "./gate/partial";
import { pngPixelCount } from "./image";
import {
	caseParameterMode,
	loadCases,
	qualityProfileFromEnvironment,
	selectCasesForProfile,
} from "./manifest";
import { writeQualityReportPartial } from "./report/partial";
import type {
	QualityBaselineCase,
	QualityCaseResult,
	QualityGateWarning,
	QualityImageCase,
} from "./types";
import {
	stagingBaselineImagePath,
	writeQualityUpdatePartial,
} from "./update/partial";

/**
 * ケースを分配するシャード数。
 * test/quality/shards のファイル数と一致させる（cases.test.ts が検証する）。
 */
export const QUALITY_SHARD_COUNT = 10;

// [Policy] 画像全体を対象とする品質ケースは、競合の激しい共有 CI ランナー上で
// 実行される可能性があるため、正しさの検証には短い単体テストのタイムアウトを使用しない。
const QUALITY_CASE_TIMEOUT_MS = 300_000;

const reportMode = process.env.QUALITY_REPORT === "1";
const updateMode = process.env.UPDATE_QUALITY_BASELINE === "1";
const profile = qualityProfileFromEnvironment();

// [Intended] 実行コストは入力の画素数にほぼ比例するため、これを重みに使う。
// 寸法は PNG の先頭 24 バイトに入っているので、全ケースをデコードせずに済む。
const caseWeight = (qualityCase: QualityImageCase): number => {
	let weight = 0;
	for (const file of [
		qualityCase.input,
		...(qualityCase.sharedPalette?.inputs ?? []),
	]) {
		weight += pngPixelCount(path.resolve(file));
	}
	return weight;
};

/**
 * ケースをシャード数ぶんのグループへ静的に分配する。
 * 重い順に空いているシャードへ詰める（最長処理時間優先）。単純な index % N だと
 * 最重量ケースが同じシャードに集まり、シャード間の実行時間が倍近く偏る。
 */
export const shardCases = (
	cases: QualityImageCase[],
	shardCount: number,
): QualityImageCase[][] => {
	const buckets: QualityImageCase[][] = Array.from(
		{ length: shardCount },
		() => [],
	);
	const loads = new Array<number>(shardCount).fill(0);
	const order = new Map(
		cases.map((qualityCase, index) => [qualityCase.id, index]),
	);
	const weighted = cases
		.map((qualityCase) => ({ qualityCase, weight: caseWeight(qualityCase) }))
		.sort(
			(left, right) =>
				right.weight - left.weight ||
				left.qualityCase.id.localeCompare(right.qualityCase.id),
		);
	for (const entry of weighted) {
		let target = 0;
		for (let index = 1; index < shardCount; index += 1) {
			if (loads[index] < loads[target]) target = index;
		}
		buckets[target].push(entry.qualityCase);
		loads[target] += entry.weight;
	}
	for (const bucket of buckets) {
		bucket.sort(
			(left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
		);
	}
	return buckets;
};

const registerGateShard = (
	cases: QualityImageCase[],
	shardIndex: number,
): void => {
	const baselineById = new Map(
		loadBaseline().cases.map((baselineCase) => [baselineCase.id, baselineCase]),
	);
	// [Intended] CI のゲートステップだけが立てる環境変数。ローカル実行では常に false になり、
	// 従来どおりすべての regression がゲート失敗になる。
	const allowDeclaredAutoChanges = allowDeclaredAutoChangesFromEnvironment();
	const declaredAutoRegressions: QualityGateWarning[] = [];
	it.each(cases)(
		"evaluates $id",
		(qualityCase) => {
			const result = runQualityCase(qualityCase);
			const isAutoCase = caseParameterMode(qualityCase) === "auto";
			expect(result.metrics.byteIdentical).toBe(true);
			// [Intended] 自動判定ケースには正解画像がなく、破綻や出力サイズは
			// 「今の自動判定の実力」そのものなので絶対値では落とさない。悪化は
			// ベースライン比較（catastrophicFailure の false→true や指標低下）で捕まえる。
			if (!isAutoCase) {
				expect(result.metrics.catastrophicFailure).toBe(false);
				expect(result.failedAssertions).not.toContain("output-size");
				expect(result.failedAssertions).not.toContain("expected-width");
				expect(result.failedAssertions).not.toContain("expected-height");
			}
			const expected = baselineById.get(qualityCase.id);
			if (expected === undefined) {
				// [Intended] 自動判定ケースは正解画像を持たないため、初回は現状を記録する
				// だけで合否は問わない。以降は compareMetrics が悪化を検出する。
				if (isAutoCase) return;
				expect(result.status, `${qualityCase.id} is a failing new case`).toBe(
					"passed",
				);
				return;
			}
			const { regressed } = compareMetrics(
				result.metrics,
				expected,
				result.status,
			);
			// [Intended] auto ケースの改善で参照画像（＝旧 auto 出力）そのものが変わると、
			// 意図的な改善でも指標比較上は必ず regressed になる。head でベースライン画像を
			// 更新済み（＝劣化を宣言済み。PR diff と比較レポートの diff で可視化される）の
			// ときだけ「要人間レビューの警告」に降格し、ゲートは落とさない。
			// catastrophicFailure の false→true と explicit ケースは対象外で必ずゲートを落とす
			// （「変更を隠せない」設計は維持する）。
			if (regressed.length > 0) {
				const baselineImageDeclaredUpdated =
					allowDeclaredAutoChanges && isAutoCase
						? isBaselineImageDeclaredUpdated(qualityCase.id)
						: false;
				if (
					shouldWarnInsteadOfFail({
						isAutoCase,
						regressedMetrics: regressed,
						allowDeclaredAutoChanges,
						baselineImageDeclaredUpdated,
					})
				) {
					declaredAutoRegressions.push({
						id: qualityCase.id,
						regressedMetrics: regressed,
					});
					return;
				}
			}
			expect(
				regressed,
				`${qualityCase.id} regressed against the stored quality baseline`,
			).toEqual([]);
		},
		QUALITY_CASE_TIMEOUT_MS,
	);
	afterAll(() => {
		writeQualityGateWarningPartial(shardIndex, declaredAutoRegressions);
	});
};

/**
 * ベースライン更新の stage1（並列生成）。各ケースを書き換え前の既存ベースラインに
 * 対して測定し、指標と新しい出力画像をステージング領域へ書き出す。全シャードが
 * 読むのは同じ既存ベースラインだけなので、この段階は読み取り専用で並列安全。
 * test/quality/baseline.json と baseline/ 本体の置き換えは stage2（cases.test.ts の
 * 更新ブロック）が集約後に一括で行う。
 */
const registerUpdateShard = (
	cases: QualityImageCase[],
	shardIndex: number,
): void => {
	const entries: QualityBaselineCase[] = [];
	it.each(cases)(
		"stages baseline update for $id",
		(qualityCase) => {
			const result = runQualityCase(qualityCase);
			entries.push(toBaselineCaseEntry(result));
			writeQualityBaselineImage(
				qualityCase,
				stagingBaselineImagePath(qualityCase.id),
			);
		},
		QUALITY_CASE_TIMEOUT_MS,
	);
	afterAll(() => {
		writeQualityUpdatePartial(shardIndex, entries);
	});
};

const registerReportShard = (
	cases: QualityImageCase[],
	shardIndex: number,
): void => {
	const results: QualityCaseResult[] = [];
	it.each(cases)(
		"reports $id",
		(qualityCase) => {
			results.push(runQualityCase(qualityCase, true));
		},
		QUALITY_CASE_TIMEOUT_MS,
	);
	// [Intended] 取れた分だけ書き出す。欠けたケースは集約側が ID 付きで報告する。
	afterAll(() => {
		writeQualityReportPartial(shardIndex, results);
	});
};

/**
 * シャードファイルから呼ぶ入口。1 始まりのシャード番号を受け取る。
 * UPDATE_QUALITY_BASELINE=1 のときはベースライン更新の並列生成、
 * QUALITY_REPORT=1 のときはレポート成果物の生成、それ以外は品質ゲートを担う。
 */
export const runCasesShard = (shardIndex: number): void => {
	const selectedCases = selectCasesForProfile(loadCases());
	const cases = shardCases(selectedCases, QUALITY_SHARD_COUNT)[shardIndex - 1];
	const assignedCases = cases ?? [];
	describe(`quality cases shard ${shardIndex}/${QUALITY_SHARD_COUNT}`, () => {
		it(`owns ${assignedCases.length} of ${selectedCases.length} cases`, () => {
			const selectedIds = new Set(
				selectedCases.map((qualityCase) => qualityCase.id),
			);
			for (const qualityCase of assignedCases) {
				expect(selectedIds.has(qualityCase.id)).toBe(true);
			}
		});
		if (assignedCases.length === 0) return;
		if (updateMode) {
			assertBaselineUpdateIsSafe(profile);
			registerUpdateShard(assignedCases, shardIndex);
			return;
		}
		if (reportMode) {
			registerReportShard(assignedCases, shardIndex);
			return;
		}
		registerGateShard(assignedCases, shardIndex);
	});
};
