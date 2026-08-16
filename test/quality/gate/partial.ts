import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type { QualityGateWarning } from "../types";

// [Policy] 品質ゲート実行中に降格した warning は、レポート成果物（tmp/quality-report）
// や更新のステージング領域（tmp/quality-baseline-update）とは別の場所に集める。
// ワークフローの「Publish quality summary」ステップがここを読んで
// GITHUB_STEP_SUMMARY へ集計する。
const WARNING_ROOT = path.resolve("tmp/quality-gate-warnings");

const partialFile = (root: string, shardIndex: number): string =>
	path.join(root, `shard-${String(shardIndex).padStart(2, "0")}.json`);

/**
 * シャードが降格した warning を、集計側が読める中間ファイルへ書き出す。
 * root は既定で本番の集約先だが、テストが実行中のゲートシャード（同じ
 * tmp/quality-gate-warnings へ書き込む）と競合しないよう差し替えられるようにする。
 */
export const writeQualityGateWarningPartial = (
	shardIndex: number,
	warnings: QualityGateWarning[],
	root: string = WARNING_ROOT,
): void => {
	mkdirSync(root, { recursive: true });
	writeFileSync(
		partialFile(root, shardIndex),
		`${JSON.stringify({ shardIndex, warnings })}\n`,
	);
};

/**
 * 全シャードの部分結果を読み出す。
 * ケース順序は保証しないため、表示側で必要なら並べ替える。
 */
export const readQualityGateWarningPartials = (
	root: string = WARNING_ROOT,
): QualityGateWarning[] => {
	if (!existsSync(root)) return [];
	const warnings: QualityGateWarning[] = [];
	for (const fileName of readdirSync(root).sort()) {
		if (!fileName.endsWith(".json")) continue;
		const partial = JSON.parse(
			readFileSync(path.join(root, fileName), "utf8"),
		) as { shardIndex: number; warnings: QualityGateWarning[] };
		warnings.push(...partial.warnings);
	}
	return warnings;
};

export const qualityGateWarningRoot = WARNING_ROOT;
