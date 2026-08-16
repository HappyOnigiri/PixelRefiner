import type { QualityCaseResult } from "../types";

/**
 * そのケースの指標が、自身の出力とは別の基準画像との比較になっているか。
 *
 * [Intended] auto ケースの基準はベースライン画像なので、取得できないと基準が自身の
 * 出力になり、誤差 0・一致率 1 が並ぶ。explicit ケースはケース定義の正解画像を基準に
 * するため、ベースラインの有無に関わらず比較として意味を持つ。
 */
export const hasMetricReference = (result: QualityCaseResult): boolean =>
	result.parameterMode !== "auto" || result.files.baseline !== null;
