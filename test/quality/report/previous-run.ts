import type { QualityResults } from "../types";

/**
 * 前回生成（＝比較の基準にしたベースライン）を持つレポートか。
 *
 * [Intended] メタデータではなく実際のケース結果から決める。前回生成の取得元は
 * リリースレポートなら前バージョンのタグ、PR なら base コミットと経路ごとに違うが、
 * 「取得できたか」はどの経路でも書き出した画像と指標の有無に現れる。取得に失敗した
 * リリースレポートや、ベースラインを持たないローカル実行では false になり、
 * 前回との比較 UI をレポートから丸ごと省く。
 */
export const hasPreviousRun = (results: QualityResults): boolean =>
	results.cases.some(
		(result) =>
			result.files.baseline !== null || result.baselineMetrics !== null,
	);
