import type { QualityReportKind } from "../types";

// [Intended] 生成経路は QUALITY_REPORT_KIND で明示する。未指定なら PR 番号の有無から
// 推定するので、既存の PR ワークフローとローカル実行は環境変数を足さずに動く。
export const reportKindFromEnvironment = (): QualityReportKind => {
	const kind = process.env.QUALITY_REPORT_KIND;
	if (kind === "pull-request" || kind === "release" || kind === "local")
		return kind;
	return process.env.QUALITY_PR_NUMBER === undefined ? "local" : "pull-request";
};
