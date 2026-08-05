/**
 * [Intended] 品質ゲートの合否判定のうち、「auto ケースの regression を警告に降格して
 * よいか」を決める部分だけを切り出す。fs アクセスを含まない純粋関数にして
 * shard.ts から使う条件分岐を単体テストしやすくする。
 */

/** この環境変数が "1" のときだけ、宣言済み auto ケースの降格を有効にする。 */
export const QUALITY_GATE_ALLOW_DECLARED_AUTO_CHANGES_ENV =
	"QUALITY_GATE_ALLOW_DECLARED_AUTO_CHANGES";

export const allowDeclaredAutoChangesFromEnvironment = (): boolean =>
	process.env[QUALITY_GATE_ALLOW_DECLARED_AUTO_CHANGES_ENV] === "1";

export type GateRegressionInput = {
	/** ケースが auto 判定（UI 既定のみ）かどうか。explicit ケースは常に対象外。 */
	isAutoCase: boolean;
	/** compareMetrics が検出した regression 項目。空配列なら regression なし。 */
	regressedMetrics: string[];
	/** ワークフロー側から渡す降格の有効フラグ。ローカル実行では常に false。 */
	allowDeclaredAutoChanges: boolean;
	/** head でこのケースのベースライン画像が更新済み（＝劣化が宣言済み）かどうか。 */
	baselineImageDeclaredUpdated: boolean;
	/** PR ベース時点のケース状態。passed の explicit ケースは降格対象外にする。 */
	baselineStatus: "passed" | "failed";
};

/**
 * [Intended] 対象ケースの regression を「要人間レビューの警告」に降格してよいかを判定する。
 * 「変更を隠せない」設計を保つため、以下はすべて満たさない限り false（＝ゲート失敗のまま）:
 * - 降格自体が有効化されている（CI のゲートステップでのみ有効）
 * - auto ケース、または PR ベース時点から既に failed の explicit ケースである
 * - regression が実際にある
 * - head でベースライン画像が更新済み（＝劣化が宣言済み。PR diff と比較レポートの
 *   画像で可視化されるため、警告に降格しても隠蔽にはならない）
 *
 * auto ケースの各指標は旧ベースライン画像を正解として計算される。そのため、出力サイズを
 * 意図的に直した場合も status や catastrophicFailure が悪化として現れうる。画像更新による
 * 宣言を優先し、これらの指標名だけを理由に降格を拒否しない。
 */
export const shouldWarnInsteadOfFail = (
	input: GateRegressionInput,
): boolean => {
	if (!input.allowDeclaredAutoChanges) return false;
	if (input.regressedMetrics.length === 0) return false;
	if (!input.baselineImageDeclaredUpdated) return false;
	return input.isAutoCase || input.baselineStatus === "failed";
};
