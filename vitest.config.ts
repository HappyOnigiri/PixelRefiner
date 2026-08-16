import { defineConfig } from "vitest/config";

// [Policy] 共有CIランナーでは画像処理テストがCPU競合で遅くなるため、CI時だけ待機上限を延長する。
const testTimeout = process.env.CI === "true" ? 60_000 : 15_000;

export default defineConfig({
	test: {
		environment: "node",
		testTimeout,
	},
});
