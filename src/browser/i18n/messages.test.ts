import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "./language";
import { appMessageCatalogs, appMessages } from "./messages";
import { guideMessages } from "./messages/guide";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO_ROOT = resolve(HERE, "../../..");

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

// メッセージ定義そのものを除く全 TS ソースを、キーの参照検索用に連結する
const collectSourceText = (): string => {
	const chunks: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path);
				continue;
			}
			if (!entry.name.endsWith(".ts")) continue;
			if (path.startsWith(join(HERE, "messages"))) continue;
			chunks.push(readFileSync(path, "utf8"));
		}
	};
	walk(join(REPO_ROOT, "src"));
	return chunks.join("\n");
};

/**
 * [Intended] キーを実行時に組み立てている参照。
 * 静的な文字列としてはソースに現れないので、未使用判定から外す。
 */
const DYNAMIC_KEY_PREFIXES = [
	"batch.status.",
	"candidate.label.",
	"candidate.description.",
	"classification.",
	"route.",
];

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
				const expected = MODULE_OF_PREFIX[key.split(".")[0]];
				if (expected !== name) {
					misplaced.push(`${key}: ${name} にあるが ${expected ?? "不明"} が正`);
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
