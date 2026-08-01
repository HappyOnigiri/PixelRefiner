import type { Reporter } from "vitest/reporters";

export default class QualityReporter implements Reporter {
	onTestRunEnd(): void {
		process.stdout.write(
			"Quality report: tmp/quality-report/latest/index.html\n",
		);
	}
}
