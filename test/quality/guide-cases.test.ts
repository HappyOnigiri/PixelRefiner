import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCases } from "./manifest";

/**
 * [Policy] guide.html が公開する変換例と、その再現を証明する品質ケースの対応を縛る。
 * 対応づけは次の命名規約に依存する。
 *
 * - guide.html のレシピ N の文言は `guide.recipeN.*` というキーで参照する
 * - そのレシピを再現する品質ケースの ID は `guide-recipeN-<name>` にする（レシピ 1 つにつき 1 ケース）
 *
 * 規約を変える場合は、この 2 つの正規表現と test/quality/README.md の
 * 「Guide page examples」も合わせて直すこと。
 */
const RECIPE_KEY = /^guide\.recipe(\d+)\./;
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

// guide.html が参照しているレシピ番号
const recipeNumbers = [
	...new Set(
		collectHtmlKeys(readFileSync(GUIDE_HTML, "utf8")).flatMap(
			(key) => RECIPE_KEY.exec(key)?.[1] ?? [],
		),
	),
].sort(byNumber);

const guideCaseIds = loadCases()
	.map((qualityCase) => qualityCase.id)
	.filter((id) => id.startsWith("guide-"))
	.sort();

const caseIdsByRecipe = new Map<string, string[]>();
for (const id of guideCaseIds) {
	const number = RECIPE_CASE_ID.exec(id)?.[1];
	if (number === undefined) continue;
	caseIdsByRecipe.set(number, [...(caseIdsByRecipe.get(number) ?? []), id]);
}

describe("guide recipes and quality cases", () => {
	it("guide.html のレシピ番号を取り違えていない", () => {
		// [Intended] 抽出が空のまま以降の検査を通すと、レシピが 1 つも無い状態と
		// 区別できずに「対応が取れている」と誤判定する。
		expect(recipeNumbers.length).toBeGreaterThan(0);
	});

	it("guide.html の各レシピに品質ケースが 1 つある", () => {
		const problems = recipeNumbers.flatMap((number) => {
			const ids = caseIdsByRecipe.get(number) ?? [];
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
		const orphaned = [...caseIdsByRecipe.entries()]
			.filter(([number]) => !recipeNumbers.includes(number))
			.flatMap(([number, ids]) =>
				ids.map(
					(id) => `${id}: guide.html に guide.recipe${number}.* の参照が無い`,
				),
			);
		expect(orphaned).toEqual([]);
	});

	it("guide ケースの ID が guide-recipeN-<name> の規約に従っている", () => {
		// [Intended] 規約から外れた ID は上の 2 つの検査のどちらにも引っかからず、
		// 「ケースがある」と「レシピがある」の両方をすり抜ける。
		const invalid = guideCaseIds.filter((id) => !RECIPE_CASE_ID.test(id));
		expect(invalid).toEqual([]);
	});
});
