import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createUiInitialProcessOptions } from "../../src/browser/quick-settings";
import type { ProcessOptions } from "../../src/core/processor-options";
import type { FixtureAssetProvenance, QualityImageCase } from "./types";

const FIXTURE_DIRECTORY = "test/fixtures";
const EXCLUSION_REGISTRY_PATH = path.resolve(
	"test/quality/auto-case-exclusions.json",
);

type AutoCaseExclusionRegistry = {
	comment: string;
	excluded: Record<string, string>;
};

export const loadAutoCaseExclusions = (): Record<string, string> =>
	(
		JSON.parse(
			readFileSync(EXCLUSION_REGISTRY_PATH, "utf8"),
		) as AutoCaseExclusionRegistry
	).excluded;

/**
 * UI を初期状態のまま（かんたん設定は Auto プリセット、詳細設定は既定値）で
 * 処理したときに processImage へ渡るオプション。
 */
export const AUTO_CASE_OPTIONS: ProcessOptions =
	createUiInitialProcessOptions();

const caseIdForFixture = (fileName: string): string =>
	`auto-${fileName
		.slice(0, -4)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")}`;

/**
 * fixture 1 枚につき 1 件、UI 既定オプションだけで処理する自動判定ケースを組み立てる。
 * ケース定義へ手書きせずディレクトリから生成するので、fixture を追加すれば
 * 自動判定ベンチマークの対象も自動的に増える。
 */
export const buildAutoCases = (
	explicitCases: QualityImageCase[],
	fixtureRoot: string = path.resolve(FIXTURE_DIRECTORY),
	exclusions: Record<string, string> = loadAutoCaseExclusions(),
): QualityImageCase[] => {
	// [Intended] 期待値として使われている fixture は自動判定の入力にしない。
	// 期待値は処理後の姿であり、入力に回すと二重処理を測ることになる。
	const expectedFiles = new Set(
		explicitCases.map((qualityCase) => qualityCase.expected),
	);
	const provenanceByFile = new Map<string, FixtureAssetProvenance>();
	for (const qualityCase of explicitCases) {
		for (const asset of qualityCase.assets) {
			if (!provenanceByFile.has(asset.file))
				provenanceByFile.set(asset.file, asset);
		}
	}
	for (const [caseId, reason] of Object.entries(exclusions)) {
		if (reason.trim().length === 0) {
			throw new Error(`Auto-case exclusion requires a reason: ${caseId}`);
		}
	}
	const matchedExclusions = new Set<string>();
	const autoCases: QualityImageCase[] = [];
	for (const fileName of readdirSync(fixtureRoot).sort()) {
		if (!fileName.endsWith(".png")) continue;
		const file = `${FIXTURE_DIRECTORY}/${fileName}`;
		if (expectedFiles.has(file)) continue;
		const provenance = provenanceByFile.get(file);
		if (provenance === undefined) continue;
		const caseId = caseIdForFixture(fileName);
		// [Policy] 専用オプションや複数画像を前提とする fixture は、理由を台帳へ残して
		// 画像単体の Auto 品質レポートから除外する。explicit ケース自体は引き続き測定する。
		if (caseId in exclusions) {
			matchedExclusions.add(caseId);
			continue;
		}
		autoCases.push({
			id: caseId,
			featureIds: ["PRF-400"],
			profile: "full",
			parameterMode: "auto",
			inputKind: "unclassified",
			degradationPatterns: [],
			// [Intended] 実行時は benchmark 側が AUTO_CASE_OPTIONS へ差し替える。
			// ケース側に値を持たせると、UI 既定を変えたときに両方直す必要が出る。
			options: {},
			input: file,
			assertions: [
				"deterministic-output",
				"no-catastrophic-failure",
				"auto-decision-unchanged",
			],
			expectation: {},
			assets: [provenance],
		});
	}
	for (const caseId of Object.keys(exclusions)) {
		if (!matchedExclusions.has(caseId)) {
			throw new Error(`Unknown auto-case exclusion: ${caseId}`);
		}
	}
	return autoCases;
};
