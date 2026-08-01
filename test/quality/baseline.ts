import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { QualityBaseline } from "./types";

const DEFAULT_BASELINE_ROOT = path.resolve("test/quality/baseline");
const DEFAULT_BASELINE_FILE = path.resolve("test/quality/baseline.json");

export const baselineRoot = (): string =>
	path.resolve(process.env.QUALITY_BASELINE_ROOT ?? DEFAULT_BASELINE_ROOT);

export const baselineFile = (): string =>
	path.resolve(process.env.QUALITY_BASELINE_FILE ?? DEFAULT_BASELINE_FILE);

export const baselineImagePath = (caseId: string): string =>
	path.join(baselineRoot(), `${caseId}.png`);

export const loadBaseline = (): QualityBaseline => {
	const file = baselineFile();
	if (!existsSync(file))
		return { version: 2, commit: "unavailable", cases: [] };
	return JSON.parse(readFileSync(file, "utf8")) as QualityBaseline;
};
