import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateQualityReport, reportRoot } from "./benchmark";
import { loadCases } from "./manifest";

const enabled = process.env.QUALITY_REPORT === "1";

describe.skipIf(!enabled)("quality report", () => {
	it("writes JSON, Markdown, HTML, and every case artifact", () => {
		const allCases = loadCases();
		const profile = process.env.QUALITY_PROFILE ?? "full";
		const selectedCases = allCases.filter(
			(qualityCase) => profile === "full" || qualityCase.profile === "smoke",
		);
		const results = generateQualityReport(selectedCases);
		expect(results.cases).toHaveLength(selectedCases.length);
		expect(existsSync(path.join(reportRoot, "index.html"))).toBe(true);
		expect(existsSync(path.join(reportRoot, "summary.md"))).toBe(true);
		expect(existsSync(path.join(reportRoot, "results.json"))).toBe(true);
		const serialized = JSON.parse(
			readFileSync(path.join(reportRoot, "results.json"), "utf8"),
		) as { cases: unknown[] };
		expect(serialized.cases).toHaveLength(selectedCases.length);
		for (const qualityCase of selectedCases) {
			expect(
				existsSync(
					path.join(reportRoot, "cases", qualityCase.id, "result.png"),
				),
			).toBe(true);
		}
	}, 60_000);
});
