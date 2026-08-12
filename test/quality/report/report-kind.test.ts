import { afterEach, describe, expect, it, vi } from "vitest";
import { reportKindFromEnvironment } from "./report-kind";

afterEach(() => {
	vi.unstubAllEnvs();
});

// [Intended] 生成経路はサイドバーに載せるメタ情報を丸ごと決める。workflow 側の
// 環境変数名や許容値がずれると、main のレポートが PR レポートとして描画される。
describe("report kind from the environment", () => {
	it("takes the kind the workflow declares", () => {
		vi.stubEnv("QUALITY_REPORT_KIND", "release");
		vi.stubEnv("QUALITY_PR_NUMBER", "92");
		expect(reportKindFromEnvironment()).toBe("release");
	});

	it("falls back to a pull request when only the PR number is set", () => {
		vi.stubEnv("QUALITY_REPORT_KIND", undefined);
		vi.stubEnv("QUALITY_PR_NUMBER", "92");
		expect(reportKindFromEnvironment()).toBe("pull-request");
	});

	it("falls back to a local run when neither is set", () => {
		vi.stubEnv("QUALITY_REPORT_KIND", undefined);
		vi.stubEnv("QUALITY_PR_NUMBER", undefined);
		expect(reportKindFromEnvironment()).toBe("local");
	});

	it("ignores a kind it does not know", () => {
		vi.stubEnv("QUALITY_REPORT_KIND", "nightly");
		vi.stubEnv("QUALITY_PR_NUMBER", undefined);
		expect(reportKindFromEnvironment()).toBe("local");
	});
});
