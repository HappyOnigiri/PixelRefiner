import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type { QualityCaseResult } from "../types";
import { QUALITY_REPORT_VERSION } from "../types";

// [Policy] 部分結果はレポート成果物と混ぜない。tmp/quality-report/latest は
// そのまま CI のアップロード対象になるため、中間ファイルを含めない場所へ書く。
const PARTIAL_ROOT = path.resolve("tmp/quality-report/partial");

const partialFile = (shardIndex: number): string =>
	path.join(PARTIAL_ROOT, `shard-${String(shardIndex).padStart(2, "0")}.json`);

type QualityReportPartial = {
	shardIndex: number;
	/** 書き出したときのレポート形式。読み出し側で世代の食い違いを弾くために持つ。 */
	reportVersion: string;
	cases: QualityCaseResult[];
};

/** シャードが担当したケースの結果を、集約側が読める中間ファイルへ書き出す。 */
export const writeQualityReportPartial = (
	shardIndex: number,
	cases: QualityCaseResult[],
): void => {
	mkdirSync(PARTIAL_ROOT, { recursive: true });
	const partial: QualityReportPartial = {
		shardIndex,
		reportVersion: QUALITY_REPORT_VERSION,
		cases,
	};
	writeFileSync(partialFile(shardIndex), `${JSON.stringify(partial)}\n`);
};

/**
 * 全シャードの部分結果を読み出す。
 * ケース順序は集約側でケース定義の順に並べ直すため、ここでは保証しない。
 * [Intended] 世代の違う部分結果は読まずに落とす。JSON はそのままキャストして流すので、
 * 前の形式で書かれたケースが残っていると、欠けたフィールドを読む描画側が
 * 意味の分からない例外で落ち、途中まで書いた成果物だけが残る。
 */
export const readQualityReportPartials = (): QualityCaseResult[] => {
	if (!existsSync(PARTIAL_ROOT)) return [];
	const cases: QualityCaseResult[] = [];
	for (const fileName of readdirSync(PARTIAL_ROOT).sort()) {
		if (!fileName.endsWith(".json")) continue;
		const partial = JSON.parse(
			readFileSync(path.join(PARTIAL_ROOT, fileName), "utf8"),
		) as Partial<QualityReportPartial>;
		if (partial.reportVersion !== QUALITY_REPORT_VERSION) {
			throw new Error(
				`Quality report partial ${fileName} was written for report version ` +
					`${partial.reportVersion ?? "unknown"}, but this run expects ` +
					`${QUALITY_REPORT_VERSION}. Remove ${PARTIAL_ROOT} and rerun the shards.`,
			);
		}
		cases.push(...(partial.cases ?? []));
	}
	return cases;
};

export const qualityReportPartialRoot = PARTIAL_ROOT;
