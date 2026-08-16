import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	BUILT_IN_PRESETS,
	type QuickBackground,
	type QuickDithering,
	type QuickReductionMode,
	type QuickSettingsState,
} from "../../src/browser/quick-settings";
import type {
	CellScale,
	DetailLevel,
	ProcessingMode,
} from "../../src/shared/types";
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

// [Intended] cases.json は型検査を経ずに読み込むので、かんたん設定の項目名と値は
// 実行時に確かめる。Record で全選択肢を並べているのは、UI 側に選択肢が増えたときに
// この表の更新漏れを型エラーとして検出するため。項目そのものの追加漏れも同じ理由で
// 型エラーにする（表に無い項目は unknown quick setting として弾かれてしまう）。
const QUICK_SETTING_VALUES = {
	processingMode: {
		auto: true,
		refine: true,
		convert: true,
		preserve: true,
	} satisfies Record<ProcessingMode, true>,
	detailLevel: {
		smallest: true,
		small: true,
		coarse: true,
		balanced: true,
		detailed: true,
	} satisfies Record<DetailLevel, true>,
	cellScale: {
		quarter: true,
		half: true,
		same: true,
		double: true,
		quadruple: true,
	} satisfies Record<CellScale, true>,
	reductionMode: {
		auto: true,
		none: true,
		"8": true,
		"16": true,
		"24": true,
		"32": true,
		mono: true,
		gb_legacy: true,
		gb_pocket: true,
		gb_light: true,
		pico8: true,
		nes: true,
		pc98: true,
		msx: true,
		c64: true,
		arne16: true,
		sfc_sprite: true,
		sfc_bg: true,
	} satisfies Record<QuickReductionMode, true>,
	background: {
		keep: true,
		auto: true,
		pick: true,
	} satisfies Record<QuickBackground, true>,
	dithering: {
		off: true,
		subtle: true,
		strong: true,
	} satisfies Record<QuickDithering, true>,
} as const satisfies Record<
	// backgroundColor は選択肢ではなく色文字列なので、この表では扱わない。
	Exclude<keyof QuickSettingsState, "backgroundColor">,
	Record<string, true>
>;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const hasOwn = (target: object, key: string): boolean =>
	// [Workaround] tsconfig の lib が ES2020 のため Object.hasOwn を型が認識しない。
	// biome-ignore lint/suspicious/noPrototypeBuiltins: 同上。lib を上げたら置き換える。
	Object.prototype.hasOwnProperty.call(target, key);

const validateQuickSettings = (qualityCase: QualityImageCase): string[] => {
	const quick = qualityCase.quickSettings;
	if (quick === undefined) return [];
	if (typeof quick !== "object" || quick === null || Array.isArray(quick)) {
		return [`${qualityCase.id}: quickSettings must be an object`];
	}
	const errors: string[] = [];
	for (const [key, value] of Object.entries(quick)) {
		if (key === "backgroundColor") {
			if (typeof value !== "string" || !HEX_COLOR.test(value)) {
				errors.push(
					`${qualityCase.id}: backgroundColor must be a #rrggbb color`,
				);
			}
			continue;
		}
		if (!hasOwn(QUICK_SETTING_VALUES, key)) {
			errors.push(`${qualityCase.id}: unknown quick setting ${key}`);
			continue;
		}
		const allowed =
			QUICK_SETTING_VALUES[key as keyof typeof QUICK_SETTING_VALUES];
		if (typeof value !== "string" || !hasOwn(allowed, value)) {
			errors.push(`${qualityCase.id}: invalid ${key} ${String(value)}`);
		}
	}
	// [Intended] 背景色を選ぶ操作は色の指定とセットでしか案内されないので、
	// 片方だけのケースは掲載手順を再現しない。
	if (quick.background === "pick" && quick.backgroundColor === undefined) {
		errors.push(`${qualityCase.id}: background pick requires backgroundColor`);
	}
	return errors;
};

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
			if (qualityCase.quickSettings !== undefined) {
				errors.push(
					`${qualityCase.id}: preset cases must not define quickSettings`,
				);
			}
		}
		if (qualityCase.quickSettings !== undefined) {
			errors.push(...validateQuickSettings(qualityCase));
			if (caseParameterMode(qualityCase) === "auto") {
				errors.push(
					`${qualityCase.id}: auto cases must not define quickSettings`,
				);
			}
			// [Intended] プリセットと同じ理由で、かんたん設定のケースも案内された操作だけで測る。
			if (Object.keys(qualityCase.options).length > 0) {
				errors.push(
					`${qualityCase.id}: quick settings cases must not define case options`,
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
