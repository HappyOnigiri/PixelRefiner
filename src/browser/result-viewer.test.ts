import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readHtmlWithIncludes } from "../../scripts/html-includes";
import { ResultViewer } from "./result-viewer";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO_ROOT = resolve(HERE, "../..");

/**
 * ResultViewer が参照するクラスフックをソースから集める。
 * [Intended] 一覧をテストへ書き写さず `".js-*"` の形のリテラルを拾うので、
 * 実装側でフックが増えても追随する。コメント内の同じ書き方も対象に含める。
 * フック名を名指しする記述は、それ自体が HTML への依存を表すため。
 */
const collectSourceHooks = (source: string): string[] => {
	const hooks = new Set<string>();
	for (const [, hook] of source.matchAll(/"\.(js-[a-zA-Z0-9-]+)"/g)) {
		hooks.add(hook);
	}
	return [...hooks].sort();
};

/** class 属性に現れるクラスフックを集める */
const collectMarkupHooks = (markup: string): Set<string> => {
	const hooks = new Set<string>();
	for (const [, value] of markup.matchAll(/class="([^"]*)"/g)) {
		for (const name of value.split(/\s+/)) {
			if (name.startsWith("js-")) hooks.add(name);
		}
	}
	return hooks;
};

/**
 * id を起点に要素のマークアップを切り出す。
 * [Intended] 行番号で範囲を決めない。index.html は編集頻度が高く、
 * 行番号を固定するとマークアップより先にテストが壊れる。
 */
const extractElementById = (html: string, id: string): string => {
	const attributeIndex = html.indexOf(`id="${id}"`);
	if (attributeIndex < 0) throw new Error(`id="${id}" が index.html にない`);
	const start = html.lastIndexOf("<", attributeIndex);
	const tagName = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(start))?.[1];
	if (!tagName) throw new Error(`id="${id}" の開始タグを特定できない`);
	// 同名タグの開閉を数えて、対応する閉じタグまでを取り出す
	const tags = new RegExp(`<${tagName}\\b|</${tagName}>`, "g");
	tags.lastIndex = start;
	let depth = 0;
	for (let match = tags.exec(html); match; match = tags.exec(html)) {
		depth += match[0].startsWith("</") ? -1 : 1;
		if (depth === 0) return html.slice(start, match.index + match[0].length);
	}
	throw new Error(`id="${id}" の閉じタグが見つからない`);
};

// [Intended] コメントを外してから走査する。フックを例示するコメントが
// 出力パネル側にあり、要素が消えても残るので実在の証拠にならない。
const stripComments = (html: string): string =>
	html.replace(/<!--[\s\S]*?-->/g, "");

const createViewer = () => {
	const attributes = new Map<string, string>();
	const dataset: Record<string, string> = {};
	const indicator = {
		hidden: true,
		dataset,
		setAttribute: (name: string, value: string) => {
			attributes.set(name, value);
			if (name === "data-tooltip") dataset.tooltip = value;
		},
		removeAttribute: (name: string) => {
			attributes.delete(name);
			if (name === "data-tooltip") delete dataset.tooltip;
		},
	} as unknown as HTMLElement;
	const viewer = Object.create(ResultViewer.prototype) as ResultViewer;
	Object.assign(viewer, { warningIndicator: indicator });
	return { attributes, indicator, viewer };
};

describe("ResultViewer.updateWarnings", () => {
	it("警告をアイコンのツールチップとアクセシブル名に表示する", () => {
		const { attributes, indicator, viewer } = createViewer();

		viewer.updateWarnings(["信頼度が低いです。", "結果を確認してください。"]);

		expect(indicator.hidden).toBe(false);
		expect(indicator.dataset.tooltip).toBe(
			"信頼度が低いです。\n結果を確認してください。",
		);
		expect(attributes.get("aria-label")).toBe(
			"信頼度が低いです。\n結果を確認してください。",
		);
	});

	it("再処理開始時は前回の警告を非表示にする", () => {
		const { attributes, indicator, viewer } = createViewer();
		viewer.updateWarnings(["前回の警告"]);

		viewer.updateWarnings([]);

		expect(indicator.hidden).toBe(true);
		expect(indicator.dataset.tooltip).toBeUndefined();
		expect(attributes.has("aria-label")).toBe(false);
	});
});

describe("ResultViewer のクラスフック", () => {
	/**
	 * [Policy] 表示コントロールのマークアップは出力パネルと結果モーダルに
	 * 意図的に複製されており、整合は index.html のコメントの指示だけが担保していた。
	 * 片方だけにフックを足しても型検査もテストも落ちないため、ここで機械的に縛る。
	 */
	const source = readFileSync(join(HERE, "result-viewer.ts"), "utf8");
	// [Intended] index.html は partials/ へ分割されているので、ビルドと同じ取り込みを
	// 済ませた 1 つのマークアップとして読む。両ブロックが別のパーシャルにあっても、
	// 検査の対象はブラウザが受け取るマークアップのままにするため。
	const html = stripComments(readHtmlWithIncludes(REPO_ROOT, "index.html"));
	const hooks = collectSourceHooks(source);

	it("ソースからフックを抽出できている", () => {
		// 抽出が空振りすると以降の検査が素通りするので、取れていること自体を確かめる
		expect(hooks.length).toBeGreaterThan(0);
	});

	for (const id of ["output-panel", "result-modal"]) {
		it(`#${id} に ResultViewer が参照するフックがすべてある`, () => {
			// [Intended] 検査は「ResultViewer が参照するフック ⊆ ブロック」の一方向。
			// 候補一覧やモーダルの閉じるボタンなど片側にしか無いフックが正なので、
			// 2 ブロックの集合一致は求めない。
			const present = collectMarkupHooks(extractElementById(html, id));
			expect(hooks.filter((hook) => !present.has(hook))).toEqual([]);
		});
	}
});
