import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HTML_PARTIALS_DIRECTORY, resolveHtmlIncludes } from "./html-includes";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../..");

/** 取り込み対象を書いた一時的なプロジェクトルートを作る */
const createRoot = (files: Record<string, string>): string => {
	const root = mkdtempSync(join(tmpdir(), "html-includes-"));
	for (const [name, content] of Object.entries(files)) {
		const path = join(root, name);
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, content, "utf8");
	}
	return root;
};

describe("resolveHtmlIncludes", () => {
	it("取り込んだ内容を指示と同じ深さへ字下げする", () => {
		const root = createRoot({
			"partials/a.html": '<div class="a">\n  <span>x</span>\n</div>\n',
		});
		expect(
			resolveHtmlIncludes("<body>\n  <!-- @include partials/a.html -->\n", {
				root,
			}),
		).toBe('<body>\n  <div class="a">\n    <span>x</span>\n  </div>\n');
	});

	it("空行には字下げを足さない", () => {
		const root = createRoot({ "partials/a.html": "<i></i>\n\n<b></b>\n" });
		expect(
			resolveHtmlIncludes("  <!-- @include partials/a.html -->\n", { root }),
		).toBe("  <i></i>\n\n  <b></b>\n");
	});

	it("<pre> の中身には字下げを足さない", () => {
		// 中身へ空白を足すと画面に出る文字列が変わってしまう
		const root = createRoot({
			"partials/a.html": "<div>\n  <pre><code>x\ny</code></pre>\n</div>\n",
		});
		expect(
			resolveHtmlIncludes("    <!-- @include partials/a.html -->\n", { root }),
		).toBe("    <div>\n      <pre><code>x\ny</code></pre>\n    </div>\n");
	});

	it("パーシャルの中の取り込み指示も解決する", () => {
		const root = createRoot({
			"partials/outer.html":
				"<div>\n  <!-- @include partials/inner.html -->\n</div>\n",
			"partials/inner.html": "<span></span>\n",
		});
		expect(
			resolveHtmlIncludes("<!-- @include partials/outer.html -->\n", { root }),
		).toBe("<div>\n  <span></span>\n</div>\n");
	});

	it("取り込んだファイルを onInclude で通知する", () => {
		const root = createRoot({ "partials/a.html": "<i></i>\n" });
		const seen: string[] = [];
		resolveHtmlIncludes("<!-- @include partials/a.html -->\n", {
			root,
			onInclude: (path) => seen.push(path),
		});
		expect(seen).toEqual([join(root, "partials/a.html")]);
	});

	it("行の途中に書かれた取り込み指示を見逃さず失敗する", () => {
		// 静かに素通りすると、パーシャルの内容が丸ごと欠けたまま出荷されてしまう
		const root = createRoot({ "partials/a.html": "<i></i>\n" });
		expect(() =>
			resolveHtmlIncludes("<div><!-- @include partials/a.html --></div>\n", {
				root,
			}),
		).toThrow(/解決できない @include/);
	});

	it("読めないパーシャルを指していれば失敗する", () => {
		const root = createRoot({});
		expect(() =>
			resolveHtmlIncludes("<!-- @include partials/none.html -->\n", { root }),
		).toThrow(/パーシャルを読めません/);
	});

	it("プロジェクトの外を指す取り込みを拒む", () => {
		const root = createRoot({});
		expect(() =>
			resolveHtmlIncludes("<!-- @include ../secret.html -->\n", { root }),
		).toThrow(/プロジェクトの外/);
	});

	it("循環参照を有限で止める", () => {
		const root = createRoot({
			"partials/a.html": "<!-- @include partials/b.html -->\n",
			"partials/b.html": "<!-- @include partials/a.html -->\n",
		});
		expect(() =>
			resolveHtmlIncludes("<!-- @include partials/a.html -->\n", { root }),
		).toThrow(/循環参照/);
	});
});

describe("エントリ HTML のパーシャル", () => {
	it("すべてどれかのエントリからちょうど 1 回取り込まれている", () => {
		// [Intended] 取り込み回数で数える。取り込み忘れのパーシャルは編集しても
		// 画面に出ないまま気づけず、逆に 2 か所から取り込むと id が重複して
		// getElementById が先勝ちで片方しか掴まないまま出荷される。
		const counts = new Map<string, number>();
		for (const entry of ["index.html", "guide.html"]) {
			resolveHtmlIncludes(readFileSync(join(REPO_ROOT, entry), "utf8"), {
				root: REPO_ROOT,
				onInclude: (path) => counts.set(path, (counts.get(path) ?? 0) + 1),
			});
		}
		const directory = join(REPO_ROOT, HTML_PARTIALS_DIRECTORY);
		const files = readdirSync(directory, { recursive: true, encoding: "utf8" })
			.filter((name) => name.endsWith(".html"))
			.map((name) => join(directory, name));
		expect(
			files
				.filter((path) => (counts.get(path) ?? 0) !== 1)
				.map(
					(path) => `${relative(REPO_ROOT, path)}: ${counts.get(path) ?? 0}`,
				),
		).toEqual([]);
		expect(files.length).toBeGreaterThan(0);
	});
});
