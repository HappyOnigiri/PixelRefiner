import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHtmlIncludes } from "./html-includes";

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
