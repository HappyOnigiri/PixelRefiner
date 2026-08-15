import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { BUILT_IN_PRESETS } from "../../src/browser/quick-settings";
import { buildAutoCases } from "./auto-cases";
import type { QualityImageCase, QualityParameterMode } from "./types";

export type QualityProfile = QualityImageCase["profile"];

export const QUALITY_ROOT = path.resolve("test/quality");
export const FIXTURE_ROOT = path.resolve("test/fixtures");
export const MANIFEST_PATH = path.join(QUALITY_ROOT, "cases.json");
const CHECKED_IN_BASELINE_ROOT = path.join(QUALITY_ROOT, "baseline");
const SAFE_CASE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BUILT_IN_PRESET_IDS = new Set(
	BUILT_IN_PRESETS.map((preset) => preset.id),
);

export const caseParameterMode = (
	qualityCase: QualityImageCase,
): QualityParameterMode => qualityCase.parameterMode ?? "explicit";

export const loadExplicitCases = (): QualityImageCase[] =>
	JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as QualityImageCase[];

// [Intended] 自動判定ケースは fixture ディレクトリから生成して連結する。
// cases.json に書き並べると fixture 追加時に取りこぼしが起きるため。
export const loadCases = (): QualityImageCase[] => {
	const explicitCases = loadExplicitCases();
	return [...explicitCases, ...buildAutoCases(explicitCases, FIXTURE_ROOT)];
};

export const qualityProfileFromEnvironment = (): QualityProfile => {
	const profile = process.env.QUALITY_PROFILE ?? "full";
	if (profile !== "smoke" && profile !== "full") {
		throw new Error(`Unsupported quality profile: ${profile}`);
	}
	return profile;
};

export const selectCasesForProfile = (
	cases: QualityImageCase[],
	profile: QualityProfile = qualityProfileFromEnvironment(),
): QualityImageCase[] =>
	cases.filter(
		(qualityCase) => profile === "full" || qualityCase.profile === "smoke",
	);

export const qualityCaseDirectory = (caseId: string): string => {
	if (!SAFE_CASE_ID.test(caseId)) {
		throw new Error(`Unsafe quality case ID: ${caseId}`);
	}
	return `cases/${caseId}`;
};

const REQUIRED_DEGRADATIONS = [
	"nearest-2x",
	"nearest-3x",
	"nearest-4x",
	"nearest-8x",
	"nearest-16x",
	"nearest-32x",
	"nearest-1.5x",
	"nearest-2.5x",
	"nearest-3.2x",
	"bilinear",
	"bicubic-equivalent",
	"gaussian-blur-light",
	"rgb-noise",
	"alpha-edge-blur",
	"crop-shift-1px",
	"crop-shift-2px",
	"crop-shift-3px",
	"padding",
	"background-white",
	"background-black",
	"background-solid",
	"background-gradient",
	"anisotropic-scale",
	"disconnected-small-component",
	"low-color-subject",
	"pixel-art-1x",
	"continuous-tone",
] as const;

export const validateManifest = (cases: QualityImageCase[]): string[] => {
	const errors: string[] = [];
	const ids = new Set<string>();
	const referencedFiles = new Set<string>();
	const degradations = new Set<string>();
	for (const qualityCase of cases) {
		if (ids.has(qualityCase.id))
			errors.push(`Duplicate case ID: ${qualityCase.id}`);
		ids.add(qualityCase.id);
		if (!SAFE_CASE_ID.test(qualityCase.id)) {
			errors.push(
				`${qualityCase.id}: case ID must contain lowercase letters, numbers, and single hyphens only`,
			);
		}
		if (/^(legacy|generated)-/.test(qualityCase.id)) {
			errors.push(
				`${qualityCase.id}: case ID must describe behavior, not provenance`,
			);
		}
		if (qualityCase.featureIds.length === 0) {
			errors.push(`${qualityCase.id}: featureIds must not be empty`);
		}
		if (qualityCase.assertions.length === 0) {
			errors.push(`${qualityCase.id}: assertions must not be empty`);
		}
		if (qualityCase.presetId !== undefined) {
			if (!BUILT_IN_PRESET_IDS.has(qualityCase.presetId)) {
				errors.push(
					`${qualityCase.id}: unknown preset ${qualityCase.presetId}`,
				);
			}
			if (caseParameterMode(qualityCase) === "auto") {
				errors.push(`${qualityCase.id}: auto cases must not define presetId`);
			}
			// [Intended] プリセット指定のケースは出荷される値をそのまま使う。オプションを
			// 併記できるようにすると、掲載どおりの操作からずれた設定で測れてしまう。
			if (Object.keys(qualityCase.options).length > 0) {
				errors.push(
					`${qualityCase.id}: preset cases must not define case options`,
				);
			}
		}
		const expectation = qualityCase.expectation;
		if (caseParameterMode(qualityCase) === "auto") {
			// [Intended] 自動判定ケースは正解画像を持たないので、正解比較の目標値は課さない。
			// 判定の妥当性は承認済みベースラインからの変化で見る。
			if (qualityCase.expected !== undefined) {
				errors.push(`${qualityCase.id}: auto cases must not define expected`);
			}
			if (Object.keys(expectation).length > 0) {
				errors.push(
					`${qualityCase.id}: auto cases must not define expectation targets`,
				);
			}
		} else if (qualityCase.expected === undefined) {
			errors.push(`${qualityCase.id}: explicit cases require expected`);
		} else if (expectation.exact) {
			if (
				expectation.maxMeanRgbaError !== undefined ||
				expectation.minEdgeF1 !== undefined ||
				expectation.minBackgroundMaskIou !== undefined ||
				expectation.minSmallComponentRetention !== undefined
			) {
				errors.push(
					`${qualityCase.id}: exact cases must not use metric allowances`,
				);
			}
		} else {
			for (const [metric, target] of [
				["maxMeanRgbaError", expectation.maxMeanRgbaError],
				["minEdgeF1", expectation.minEdgeF1],
				["minBackgroundMaskIou", expectation.minBackgroundMaskIou],
				["minSmallComponentRetention", expectation.minSmallComponentRetention],
			] as const) {
				if (target === undefined) {
					errors.push(`${qualityCase.id}: non-exact case requires ${metric}`);
				}
			}
		}
		for (const pattern of qualityCase.degradationPatterns)
			degradations.add(pattern);
		for (const file of [
			qualityCase.input,
			...(qualityCase.expected === undefined ? [] : [qualityCase.expected]),
			...(qualityCase.sharedPalette?.inputs ?? []),
		]) {
			referencedFiles.add(file);
			if (!qualityCase.assets.some((asset) => asset.file === file)) {
				errors.push(`${qualityCase.id}: missing provenance for ${file}`);
			}
		}
		for (const asset of qualityCase.assets) {
			referencedFiles.add(asset.file);
			if (!asset.modificationAllowed || !asset.redistributionAllowed) {
				errors.push(
					`${qualityCase.id}: unusable asset terms for ${asset.file}`,
				);
			}
		}
	}
	for (const pattern of REQUIRED_DEGRADATIONS) {
		if (!degradations.has(pattern))
			errors.push(`Missing degradation: ${pattern}`);
	}
	for (const fileName of readdirSync(FIXTURE_ROOT)) {
		if (!fileName.endsWith(".png")) continue;
		const relativePath = `test/fixtures/${fileName}`;
		if (!referencedFiles.has(relativePath)) {
			errors.push(`Unregistered fixture: ${relativePath}`);
		}
	}
	if (!existsSync(CHECKED_IN_BASELINE_ROOT)) {
		errors.push("Missing checked-in quality baseline directory");
	} else {
		const baselineIds = new Set(
			readdirSync(CHECKED_IN_BASELINE_ROOT)
				.filter((fileName) => fileName.endsWith(".png"))
				.map((fileName) => fileName.slice(0, -4)),
		);
		for (const id of ids) {
			if (!baselineIds.has(id)) errors.push(`Missing baseline image: ${id}`);
		}
		for (const id of baselineIds) {
			if (!ids.has(id)) errors.push(`Unregistered baseline image: ${id}`);
		}
	}
	return errors;
};
