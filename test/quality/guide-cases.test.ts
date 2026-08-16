import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCases } from "./manifest";
import type { QualityImageCase } from "./types";

/**
 * [Policy] guide.html が公開する変換例と、その再現を証明する品質ケースの対応を縛る。
 * 対応づけは次の命名規約に依存する。
 *
 * - guide.html のレシピ N の文言は `guide.recipeN.*` というキーで参照する
 * - レシピ N の記事は見出しを `guide.recipeN.heading` で 1 つだけ持つ
 * - そのレシピを再現する品質ケースの ID は `guide-recipeN-<name>` にする（レシピ 1 つにつき 1 ケース）
 *
 * 規約を変える場合は、この 3 つの正規表現と test/quality/README.md の
 * 「Guide page examples」も合わせて直すこと。
 */
const RECIPE_KEY = /^guide\.recipe(\d+)\./;
const RECIPE_HEADING_KEY = /^guide\.recipe(\d+)\.heading$/;
const RECIPE_CASE_ID = /^guide-recipe(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const GUIDE_HTML = path.resolve("guide.html");

// data-i18n / data-i18n-attr で参照しているキーを HTML から取り出す
// （src/browser/i18n/messages.test.ts の collectHtmlKeys と同じ抽出）
const collectHtmlKeys = (html: string): string[] => {
	const keys: string[] = [];
	for (const [, key] of html.matchAll(/data-i18n="([^"]+)"/g)) {
		keys.push(key);
	}
	for (const [, config] of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
		for (const pair of config.split(",")) {
			const key = pair.split(":")[1];
			if (key) keys.push(key.trim());
		}
	}
	return keys;
};

const byNumber = (a: string, b: string) => Number(a) - Number(b);

const htmlKeys = collectHtmlKeys(readFileSync(GUIDE_HTML, "utf8"));

// guide.html が参照しているレシピ番号
const recipeNumbers = [
	...new Set(htmlKeys.flatMap((key) => RECIPE_KEY.exec(key)?.[1] ?? [])),
].sort(byNumber);

// レシピ番号ごとの見出しキーの本数 = そのレシピを名乗る記事の数
const headingCountByRecipe = new Map<string, number>();
for (const key of htmlKeys) {
	const number = RECIPE_HEADING_KEY.exec(key)?.[1];
	if (number === undefined) continue;
	headingCountByRecipe.set(number, (headingCountByRecipe.get(number) ?? 0) + 1);
}

const guideCases = loadCases()
	.filter((qualityCase) => qualityCase.id.startsWith("guide-"))
	.sort((a, b) => a.id.localeCompare(b.id));

const guideCaseIds = guideCases.map((qualityCase) => qualityCase.id);

const casesByRecipe = new Map<string, QualityImageCase[]>();
for (const qualityCase of guideCases) {
	const number = RECIPE_CASE_ID.exec(qualityCase.id)?.[1];
	if (number === undefined) continue;
	casesByRecipe.set(number, [
		...(casesByRecipe.get(number) ?? []),
		qualityCase,
	]);
}

const idsOfRecipe = (number: string): string[] =>
	(casesByRecipe.get(number) ?? []).map((qualityCase) => qualityCase.id);

describe("guide recipes and quality cases", () => {
	it("guide.html のレシピ番号を取り違えていない", () => {
		// [Intended] 抽出が空のまま以降の検査を通すと、レシピが 1 つも無い状態と
		// 区別できずに「対応が取れている」と誤判定する。
		expect(recipeNumbers.length).toBeGreaterThan(0);
	});

	it("guide.html のレシピ記事が番号ごとに 1 つある", () => {
		// [Intended] レシピ番号は Set で重複を落とすため、記事を複製して番号を
		// 直し忘れても 1 レシピとしか見えず、既存のケース 1 件で全検査が通る。
		// 見出しキーの本数で記事の数を数え直し、番号の重複を落とす。
		const problems = recipeNumbers.flatMap((number) => {
			const count = headingCountByRecipe.get(number) ?? 0;
			if (count === 1) return [];
			if (count === 0) {
				return [
					`guide.recipe${number}: guide.recipe${number}.heading の参照が guide.html に無い`,
				];
			}
			return [
				`guide.recipe${number}: 見出しが ${count} 件ある。レシピ記事 1 つにつき見出し 1 つ`,
			];
		});
		expect(problems).toEqual([]);
	});

	it("guide.html の各レシピに品質ケースが 1 つある", () => {
		const problems = recipeNumbers.flatMap((number) => {
			const ids = idsOfRecipe(number);
			if (ids.length === 1) return [];
			if (ids.length === 0) {
				return [
					`guide.recipe${number}: guide-recipe${number}-* の品質ケースが cases.json に無い`,
				];
			}
			return [
				`guide.recipe${number}: 品質ケースが ${ids.length} 件ある（${ids.join(", ")}）。レシピ 1 つにつき 1 ケース`,
			];
		});
		expect(problems).toEqual([]);
	});

	it("品質ケースに対応するレシピが guide.html に残っている", () => {
		// [Intended] レシピを消してケースだけ残ると、公開していない変換例を
		// 再現し続けることになる。逆向きも落とす。
		const orphaned = [...casesByRecipe.keys()]
			.filter((number) => !recipeNumbers.includes(number))
			.flatMap((number) =>
				idsOfRecipe(number).map(
					(id) => `${id}: guide.html に guide.recipe${number}.* の参照が無い`,
				),
			);
		expect(orphaned).toEqual([]);
	});

	it("guide ケースの入出力がそのレシピの掲載画像を指している", () => {
		// [Intended] レシピとケースの対応づけは ID の番号だけが根拠なので、
		// 既存ケースを複製して ID だけ書き換えると、別レシピの画像を検証した
		// まま「そのレシピは再現できている」と表示し続ける。
		const problems = [...casesByRecipe.entries()].flatMap(([number, cases]) =>
			cases.flatMap((qualityCase) => {
				const prefix = `public/guide/recipe${number}-`;
				if (qualityCase.expected === undefined) {
					return [`${qualityCase.id}: 掲載結果を示す expected が無い`];
				}
				return (
					[
						["input", qualityCase.input],
						["expected", qualityCase.expected],
					] as const
				).flatMap(([field, file]) =>
					file.startsWith(prefix)
						? []
						: [
								`${qualityCase.id}: ${field} が ${prefix}* を指していない（${file}）`,
							],
				);
			}),
		);
		expect(problems).toEqual([]);
	});

	it("guide ケースの ID が guide-recipeN-<name> の規約に従っている", () => {
		// [Intended] 規約から外れた ID は上の 2 つの検査のどちらにも引っかからず、
		// 「ケースがある」と「レシピがある」の両方をすり抜ける。
		const invalid = guideCaseIds.filter((id) => !RECIPE_CASE_ID.test(id));
		expect(invalid).toEqual([]);
	});
});
