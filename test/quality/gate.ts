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
};

/**
 * [Intended] auto ケースの regression を「要人間レビューの警告」に降格してよいかを判定する。
 * 「変更を隠せない」設計を保つため、以下はすべて満たさない限り false（＝ゲート失敗のまま）:
 * - 降格自体が有効化されている（CI のゲートステップでのみ有効）
 * - auto ケースである（explicit ケースは正解画像を持つため常にゲート失敗）
 * - regression が実際にある
 * - catastrophicFailure が false→true になっていない（破局的劣化は宣言の有無を問わず失敗）
 * - head でベースライン画像が更新済み（＝劣化が宣言済み。PR diff と比較レポートの
 *   画像で可視化されるため、警告に降格しても隠蔽にはならない）
 */
export const shouldWarnInsteadOfFail = (
	input: GateRegressionInput,
): boolean => {
	if (!input.allowDeclaredAutoChanges) return false;
	if (!input.isAutoCase) return false;
	if (input.regressedMetrics.length === 0) return false;
	if (input.regressedMetrics.includes("catastrophicFailure")) return false;
	return input.baselineImageDeclaredUpdated;
};
