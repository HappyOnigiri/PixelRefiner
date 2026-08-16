import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CandidateSuggestionReason } from "../../../src/core/candidate-suggestion-decision";
import type {
	CandidateKind,
	CellScale,
	ProcessingRoute,
	ProcessingWarningCode,
} from "../../../src/shared/types";
import { QUALITY_METRIC_RULES } from "../comparison";
import type { QualityChangeStatus } from "../types";
import {
	CANDIDATE_SUGGESTION_DECISION_KEYS,
	WARNING_PRESENTATION_KEYS,
} from "./auto-diagnostics";
import { TARGET_STATE_KEYS } from "./target-section";
import { REPORT_LANGUAGES, REPORT_MESSAGES } from "./translations";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const QUALITY_DIR = resolve(HERE, "..");

// 型の値集合をそのまま列挙する。値の増減が型エラーになるので取りこぼさない。
const valuesOf = <T extends string>(values: Record<T, true>): string[] =>
	Object.keys(values);

const WARNING_CODES = valuesOf<ProcessingWarningCode>({
	LOW_GRID_CONFIDENCE: true,
	BACKGROUND_UNCERTAIN: true,
	BACKGROUND_REMOVAL_SKIPPED: true,
	CONTENT_LOSS_RISK: true,
	ONE_AXIS_DETECTION_FAILED: true,
	EXTREME_OUTPUT_SIZE: true,
	NO_CONTENT: true,
	FALLBACK_TO_PRESERVE: true,
});

const readSource = (directory: string, name: string): string =>
	readFileSync(join(directory, name), "utf8");

/** レポートの HTML を組み立てるモジュール。訳文定義とテストは含めない。 */
const collectReportSources = (): string =>
	readdirSync(HERE)
		.filter(
			(name) =>
				name.endsWith(".ts") &&
				!name.endsWith(".test.ts") &&
				name !== "translations.ts",
		)
		.map((name) => readSource(HERE, name))
		.join("\n");

/**
 * data-i18n / data-i18n-alt / data-i18n-placeholder に直接書かれたキー。
 * [Intended] `${` を含む値は実行時に組み立てる参照なので、ここでは拾わない。
 * それらは DYNAMIC_FLAT_KEYS と GROUP_VALUES で別に押さえる。
 */
const collectStaticKeys = (source: string): string[] =>
	[...source.matchAll(/data-i18n(?:-alt|-placeholder)?="([^"$]+)"/g)].map(
		([, key]) => key,
	);

/** ケースの合否に積む名前。訳文の assertions グループはこれと 1 対 1 で対応する。 */
const collectAssertionNames = (): string[] => {
	const sources = ["metrics.ts", "benchmark.ts"]
		.map((name) => readSource(QUALITY_DIR, name))
		.join("\n");
	return [
		...new Set(
			[...sources.matchAll(/failed\.push\("([^"]+)"\)/g)].map(
				([, name]) => name,
			),
		),
	];
};

/** ソース中のリテラルから、実行時に data-i18n へ渡すキーを集める。 */
const collectKeysFromLiterals = (name: string, property: string): string[] =>
	[
		...readSource(HERE, name).matchAll(
			new RegExp(`\\b${property}: "([^"]+)"`, "g"),
		),
	].map(([, key]) => key);

/**
 * 行を組み立てるヘルパーの第 1 引数に渡すキー。
 * [Intended] ヘルパー名を列挙して拾う。呼び出し形をまとめて拾うと、キーを取らない
 * 関数の第 1 引数まで「参照済み」に数えてしまい、未使用キーの検出が緩む。
 */
const KEY_TAKING_HELPERS: Record<string, string[]> = {
	"render.ts": ["metricRow", "comparisonHeader"],
	"sidebar.ts": ["meta"],
	"target-section.ts": ["metricRow"],
};

const collectHelperKeys = (): string[] =>
	Object.entries(KEY_TAKING_HELPERS).flatMap(([name, helpers]) => {
		const source = readSource(HERE, name);
		return helpers.flatMap((helper) =>
			[...source.matchAll(new RegExp(`\\b${helper}\\(\\s*"([^"]+)"`, "g"))].map(
				([, key]) => key,
			),
		);
	});

/**
 * 実行時に `<グループ>.<値>` の形で組み立てるキーと、その値が取りうる集合。
 * 静的な文字列としてはソースに現れないので、型やランナーの値集合と突き合わせる。
 */
const GROUP_VALUES: Record<string, string[]> = {
	assertions: collectAssertionNames(),
	processingWarnings: WARNING_CODES,
	warningTriggers: WARNING_CODES,
	candidateSuggestionReasons: valuesOf<CandidateSuggestionReason>({
		LOW_GRID_CONFIDENCE: true,
		NO_WARNING: true,
		NO_LOW_GRID_CONFIDENCE: true,
		NO_CANDIDATE_PREVIEW: true,
		CANDIDATE_SELECTION_EXISTS: true,
		SHOW_CANDIDATES_DISABLED: true,
		NOT_INITIAL: true,
		NOT_AUTO: true,
	}),
	candidateKinds: valuesOf<CandidateKind>({
		"auto-result": true,
		"cell-scale": true,
		preserve: true,
		convert: true,
	}),
	candidateCellScales: valuesOf<CellScale>({
		quarter: true,
		half: true,
		same: true,
		double: true,
		quadruple: true,
	}),
};

/** 実行時に決まるフラットなキー。出所ごとに並べる。 */
const DYNAMIC_FLAT_KEYS = [
	// 目標判定・候補リスト判定・WARNING 表示先の対応表
	...Object.values(TARGET_STATE_KEYS),
	...Object.values(CANDIDATE_SUGGESTION_DECISION_KEYS),
	...Object.values(WARNING_PRESENTATION_KEYS),
	// 前回との差分と処理ルートは、値をそのままキーにする
	...valuesOf<QualityChangeStatus>({
		changed: true,
		unchanged: true,
		new: true,
	}),
	...valuesOf<ProcessingRoute>({
		refine: true,
		convert: true,
		preserve: true,
	}),
	// 指標テーブルの見出しと、悪化した指標の一覧
	...QUALITY_METRIC_RULES.map((rule) => rule.key),
	"catastrophicFailure",
	"status",
	// 前回基準との比較判定（render.ts の metricState）
	...collectKeysFromLiterals("render.ts", "translationKey"),
	// 出力サイズ行の判定（sizeCorrect の真偽をそのままキーにする）
	"passed",
	"failed",
	// 画像の見出しと alt（images.ts の ReportImage.key）
	...collectKeysFromLiterals("images.ts", "key"),
	// 真偽値の表示（target-section.ts）
	"yes",
	"no",
	// 表の見出しなど、ヘルパー経由で data-i18n に渡すキー
	...collectHelperKeys(),
];

const isGroup = (
	value: (typeof REPORT_MESSAGES)[keyof typeof REPORT_MESSAGES],
): value is Exclude<typeof value, Record<string, string>> =>
	typeof (value as Record<string, unknown>).en !== "string";

/** 訳文として登録済みのキー。グループは `<グループ>.<値>` に展開する。 */
const definedKeys = (): string[] =>
	Object.entries(REPORT_MESSAGES).flatMap(([key, value]) =>
		isGroup(value)
			? Object.keys(value).map((groupKey) => `${key}.${groupKey}`)
			: [key],
	);

describe("quality report translations", () => {
	it("すべてのキーが 3 言語そろっていて空でない", () => {
		const incomplete: string[] = [];
		const check = (key: string, entry: Record<string, string>) => {
			for (const language of REPORT_LANGUAGES) {
				if (!entry[language]?.trim()) incomplete.push(`${key} (${language})`);
			}
		};
		for (const [key, value] of Object.entries(REPORT_MESSAGES)) {
			if (isGroup(value)) {
				for (const [groupKey, entry] of Object.entries(value)) {
					check(`${key}.${groupKey}`, entry);
				}
				continue;
			}
			check(key, value);
		}
		expect(incomplete).toEqual([]);
	});

	it("グループのキーが型とランナーの値集合と過不足なく対応している", () => {
		const mismatched: string[] = [];
		for (const [group, values] of Object.entries(GROUP_VALUES)) {
			const entry = REPORT_MESSAGES[group as keyof typeof REPORT_MESSAGES];
			const defined = isGroup(entry) ? Object.keys(entry) : [];
			for (const value of values) {
				if (!defined.includes(value))
					mismatched.push(`${group}.${value}: 訳文なし`);
			}
			for (const value of defined) {
				if (!values.includes(value))
					mismatched.push(`${group}.${value}: 参照なし`);
			}
		}
		expect(mismatched).toEqual([]);
	});

	it("レポートが参照するキーは登録済み", () => {
		const defined = new Set(definedKeys());
		const missing = [
			...new Set([
				...collectStaticKeys(collectReportSources()),
				...DYNAMIC_FLAT_KEYS,
			]),
		].filter((key) => !defined.has(key));
		expect(missing).toEqual([]);
	});

	it("使われていないキーが残っていない", () => {
		const referenced = new Set([
			...collectStaticKeys(collectReportSources()),
			...DYNAMIC_FLAT_KEYS,
			...Object.entries(GROUP_VALUES).flatMap(([group, values]) =>
				values.map((value) => `${group}.${value}`),
			),
		]);
		const unused = definedKeys().filter((key) => !referenced.has(key));
		expect(unused).toEqual([]);
	});
});
