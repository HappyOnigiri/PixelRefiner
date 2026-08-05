import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type { QualityCaseResult } from "../types";

// [Policy] 部分結果はレポート成果物と混ぜない。tmp/quality-report/latest は
// そのまま CI のアップロード対象になるため、中間ファイルを含めない場所へ書く。
const PARTIAL_ROOT = path.resolve("tmp/quality-report/partial");

const partialFile = (shardIndex: number): string =>
	path.join(PARTIAL_ROOT, `shard-${String(shardIndex).padStart(2, "0")}.json`);

/** シャードが担当したケースの結果を、集約側が読める中間ファイルへ書き出す。 */
export const writeQualityReportPartial = (
	shardIndex: number,
	cases: QualityCaseResult[],
): void => {
	mkdirSync(PARTIAL_ROOT, { recursive: true });
	writeFileSync(
		partialFile(shardIndex),
		`${JSON.stringify({ shardIndex, cases })}\n`,
	);
};

/**
 * 全シャードの部分結果を読み出す。
 * ケース順序は集約側でケース定義の順に並べ直すため、ここでは保証しない。
 */
export const readQualityReportPartials = (): QualityCaseResult[] => {
	if (!existsSync(PARTIAL_ROOT)) return [];
	const cases: QualityCaseResult[] = [];
	for (const fileName of readdirSync(PARTIAL_ROOT).sort()) {
		if (!fileName.endsWith(".json")) continue;
		const partial = JSON.parse(
			readFileSync(path.join(PARTIAL_ROOT, fileName), "utf8"),
		) as { shardIndex: number; cases: QualityCaseResult[] };
		cases.push(...partial.cases);
	}
	return cases;
};

export const qualityReportPartialRoot = PARTIAL_ROOT;
