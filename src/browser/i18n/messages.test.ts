import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
	CandidateKind,
	InputClassification,
	ProcessingRoute,
} from "../../shared/types";
import type { ImageItem } from "../session";
import { LANGUAGES } from "./language";
import { appMessageCatalogs, appMessages } from "./messages";
import { guideMessages } from "./messages/guide";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO_ROOT = resolve(HERE, "../../..");

const MESSAGES_DIR = join(HERE, "messages");

const catalogs = { ...appMessageCatalogs, guide: guideMessages };
const allMessages = { ...appMessages, ...guideMessages };

// data-i18n / data-i18n-attr で参照しているキーを HTML から取り出す
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

const readHtml = (name: string) => readFileSync(join(REPO_ROOT, name), "utf8");

// メッセージ定義とテストを除く全 TS ソースを、キーの参照検索用に連結する
const collectSourceText = (): string => {
	const chunks: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				// [Intended] 除外はディレクトリ単位で判定する。パスの前方一致だと
				// messages.test.ts のような同じ接頭辞の兄弟ファイルまで外れる。
				if (path !== MESSAGES_DIR) walk(path);
				continue;
			}
			if (!entry.name.endsWith(".ts")) continue;
			// [Intended] テストの参照は使用実績に数えない。キー名を列挙している
			// テストがあるため、数えると未参照キーの検出がすり抜ける。
			if (entry.name.endsWith(".test.ts")) continue;
			chunks.push(readFileSync(path, "utf8"));
		}
	};
	walk(join(REPO_ROOT, "src"));
	return chunks.join("\n");
};

// 型の値集合をそのまま列挙する。値の増減が型エラーになるので取りこぼさない。
const valuesOf = <T extends string>(values: Record<T, true>): string[] =>
	Object.keys(values);

const CANDIDATE_KINDS: Record<CandidateKind, true> = {
	recommended: true,
	"auto-result": true,
	finer: true,
	coarser: true,
	preserve: true,
	convert: true,
};

/**
 * [Intended] キーを実行時に組み立てている参照と、その名前空間が取りうる値。
 * 静的な文字列としてはソースに現れないので、未使用判定の代わりに
 * 型の値集合との一致で過不足を検出する。
 */
const DYNAMIC_KEY_VALUES: Record<string, string[]> = {
	"batch.status.": valuesOf<ImageItem["status"]>({
		pending: true,
		processing: true,
		done: true,
		error: true,
	}),
	"candidate.label.": valuesOf(CANDIDATE_KINDS),
	"candidate.description.": valuesOf(CANDIDATE_KINDS),
	"classification.": [
		...valuesOf<InputClassification>({
			"native-pixel": true,
			"scaled-pixel": true,
			"soft-pixel": true,
			continuous: true,
			uncertain: true,
		}),
		// [Intended] 自動判定を経ていない場合に使う、型に対応しないキー。
		"manual",
	],
	"route.": valuesOf<ProcessingRoute>({
		refine: true,
		convert: true,
		preserve: true,
	}),
};

const DYNAMIC_KEY_PREFIXES = Object.keys(DYNAMIC_KEY_VALUES);

describe("i18n messages", () => {
	it("モジュール間でキーが重複しない", () => {
		const owner = new Map<string, string>();
		const duplicated: string[] = [];
		for (const [name, catalog] of Object.entries(catalogs)) {
			for (const key of Object.keys(catalog)) {
				const previous = owner.get(key);
				if (previous) {
					duplicated.push(`${key} (${previous} / ${name})`);
					continue;
				}
				owner.set(key, name);
			}
		}
		expect(duplicated).toEqual([]);
	});

	it("appMessages と appMessageCatalogs が同じモジュールを網羅している", () => {
		// [Intended] 2 つの列挙は独立しているため、片方だけにモジュールを足すと
		// 「文言は載るが検査されない」「検査はされるが文言が載らない」が起きる。
		const fromCatalogs = new Set(
			Object.values(appMessageCatalogs).flatMap((catalog) =>
				Object.keys(catalog),
			),
		);
		expect(Object.keys(appMessages).sort()).toEqual([...fromCatalogs].sort());
	});

	it("すべてのキーが 3 言語そろっていて空でない", () => {
		const incomplete: string[] = [];
		for (const [key, entry] of Object.entries(allMessages)) {
			for (const language of LANGUAGES) {
				if (!entry[language]?.trim()) incomplete.push(`${key} (${language})`);
			}
		}
		expect(incomplete).toEqual([]);
	});

	it("キーのプレフィックスと定義ファイルが対応している", () => {
		const MODULE_OF_PREFIX: Record<string, string> = {
			app: "ui",
			section: "ui",
			ui: "ui",
			modal: "ui",
			footer: "ui",
			notice: "ui",
			result: "ui",
			status: "ui",
			setting: "settings",
			option: "options",
			tooltip: "tooltips",
			preset: "presets",
			route: "presets",
			candidate: "processing",
			warning: "processing",
			error: "processing",
			classification: "processing",
			batch: "processing",
			attr: "attributes",
			guide: "guide",
		};
		const misplaced: string[] = [];
		for (const [name, catalog] of Object.entries(catalogs)) {
			for (const key of Object.keys(catalog)) {
				const prefix = key.split(".")[0];
				const expected = MODULE_OF_PREFIX[prefix];
				if (expected === undefined) {
					misplaced.push(
						`${key}: プレフィックス ${prefix} が MODULE_OF_PREFIX に未登録`,
					);
					continue;
				}
				if (expected !== name) {
					misplaced.push(`${key}: ${name} にあるが ${expected} が正`);
				}
			}
		}
		expect(misplaced).toEqual([]);
	});

	it("index.html が参照するキーは本体アプリのメッセージに登録済み", () => {
		const missing = collectHtmlKeys(readHtml("index.html")).filter(
			(key) => !(key in appMessages),
		);
		expect(missing).toEqual([]);
	});

	it("guide.html が参照するキーは登録済み", () => {
		const missing = collectHtmlKeys(readHtml("guide.html")).filter(
			(key) => !(key in allMessages),
		);
		expect(missing).toEqual([]);
	});

	it("guide.ts がレシピ集の文言を登録している", () => {
		// [Intended] guide.* は appMessages に含めないので、この呼び出しが
		// 唯一の登録経路になる。消えても t() は素のキーを返すだけで気づけない。
		const source = readFileSync(join(HERE, "../guide.ts"), "utf8");
		expect(source).toContain("i18n.registerMessages(guideMessages)");
		expect(source.indexOf("i18n.registerMessages(guideMessages)")).toBeLessThan(
			source.indexOf("i18n.updatePage()"),
		);
	});

	it("i18n 本体はレシピ集の文言を型としてだけ取り込む", () => {
		// [Intended] 値 import に変わっても型エラーにならず、guide.* の訳文が
		// 本体バンドルへ黙って戻る。ビルド成果物は CI で検査していない。
		const source = readFileSync(join(HERE, "index.ts"), "utf8");
		expect(source).toContain(
			'import type { guideMessages } from "./messages/guide"',
		);
	});

	it("実行時に組み立てるキーが型の値集合と過不足なく対応している", () => {
		const mismatched: string[] = [];
		for (const [prefix, values] of Object.entries(DYNAMIC_KEY_VALUES)) {
			const defined = Object.keys(allMessages)
				.filter((key) => key.startsWith(prefix))
				.map((key) => key.slice(prefix.length))
				.sort();
			const expected = [...values].sort();
			for (const value of expected) {
				if (!defined.includes(value))
					mismatched.push(`${prefix}${value}: 訳文なし`);
			}
			for (const value of defined) {
				if (!expected.includes(value))
					mismatched.push(`${prefix}${value}: 参照なし`);
			}
		}
		expect(mismatched).toEqual([]);
	});

	it("使われていないキーが残っていない", () => {
		const sources = collectSourceText();
		const htmlKeys = new Set([
			...collectHtmlKeys(readHtml("index.html")),
			...collectHtmlKeys(readHtml("guide.html")),
		]);
		const unused = Object.keys(allMessages).filter((key) => {
			if (DYNAMIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
				return false;
			}
			if (htmlKeys.has(key)) return false;
			return !sources.includes(`"${key}"`) && !sources.includes(`'${key}'`);
		});
		expect(unused).toEqual([]);
	});
});
