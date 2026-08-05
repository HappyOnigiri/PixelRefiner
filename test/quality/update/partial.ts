import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type { QualityBaselineCase } from "../types";

// [Policy] ステージング領域はベースライン更新の中間生成物専用。集約側が読み終えたら
// 使い捨てるので、成果物である test/quality/baseline* とは別に tmp 配下へ置く。
const UPDATE_ROOT = path.resolve("tmp/quality-baseline-update");
const PARTIAL_ROOT = path.join(UPDATE_ROOT, "partial");
const IMAGE_ROOT = path.join(UPDATE_ROOT, "images");

const partialFile = (shardIndex: number): string =>
	path.join(PARTIAL_ROOT, `shard-${String(shardIndex).padStart(2, "0")}.json`);

/** シャードが計算したベースライン更新分の指標を、集約側が読める中間ファイルへ書き出す。 */
export const writeQualityUpdatePartial = (
	shardIndex: number,
	entries: QualityBaselineCase[],
): void => {
	mkdirSync(PARTIAL_ROOT, { recursive: true });
	writeFileSync(
		partialFile(shardIndex),
		`${JSON.stringify({ shardIndex, entries })}\n`,
	);
};

/**
 * 全シャードの部分結果を読み出す。
 * ケース順序は集約側で選択済みケースの定義順に並べ直すため、ここでは保証しない。
 */
export const readQualityUpdatePartials = (): QualityBaselineCase[] => {
	if (!existsSync(PARTIAL_ROOT)) return [];
	const entries: QualityBaselineCase[] = [];
	for (const fileName of readdirSync(PARTIAL_ROOT).sort()) {
		if (!fileName.endsWith(".json")) continue;
		const partial = JSON.parse(
			readFileSync(path.join(PARTIAL_ROOT, fileName), "utf8"),
		) as { shardIndex: number; entries: QualityBaselineCase[] };
		entries.push(...partial.entries);
	}
	return entries;
};

/**
 * シャードが並列に書き出す、新しいベースライン画像のステージング先。
 * ケース ID ごとにファイルが分かれるため、シャード間で書き込み先が衝突しない。
 */
export const stagingBaselineImagePath = (caseId: string): string =>
	path.join(IMAGE_ROOT, `${caseId}.png`);

export const qualityUpdateRoot = UPDATE_ROOT;
