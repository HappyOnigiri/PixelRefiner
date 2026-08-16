import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * HTML のパーシャル取り込み。
 *
 * [Intended] 既存のプラグイン（vite-plugin-html-inject / posthtml-include など）を
 * 使わず自前で持つ。取り込みの解決を純粋な関数として公開でき、テストが
 * index.html を「1 ファイル」として読む従来の経路をそのまま保てるため。
 */

/** パーシャルを置くディレクトリ（プロジェクトルートからの相対） */
export const HTML_PARTIALS_DIRECTORY = "partials";

/** 取り込みの入れ子の上限。循環参照を有限で止める */
const MAX_INCLUDE_DEPTH = 10;

/** 未解決の取り込み指示が残っていないかの検査に使う */
const ANY_INCLUDE = /<!--\s*@include\b/;

/**
 * 中身の空白が表示に出る要素の、開始タグから終了タグの直前まで。
 * [Intended] ここへ字下げを足すと画面の文字列が変わってしまう。guide.html の
 * プロンプト例は `<pre>` の中身を列 0 から書いているので、実害がある。
 */
const WHITESPACE_SENSITIVE = /(<(pre|textarea)\b[^>]*>)([\s\S]*?)(<\/\2\b)/gi;

/**
 * 字下げの対象外にした範囲を戻すための目印。
 * [Intended] HTML の本文に現れない NUL 文字で囲む。目印が本文と衝突すると、
 * 復元の段で無関係な箇所を置き換えてしまうため。
 */
const MARK = "\u0000";
const PLACEHOLDER = new RegExp(`${MARK}(\\d+)${MARK}`, "g");

/**
 * 取り込んだ内容を、取り込み指示と同じ深さへ字下げし直す。
 * [Intended] これによりパーシャルは字下げ 0 で書ける。Prettier は断片を
 * 字下げ 0 で整形するので、`make ci` の HTML 整形検査とそのまま両立する。
 */
const indentLines = (content: string, indent: string): string => {
	if (indent === "") return content;
	// 空白が表示に出る範囲を目印へ退避してから、行単位で字下げする
	const preserved: string[] = [];
	const masked = content.replace(
		WHITESPACE_SENSITIVE,
		(_match, open: string, _tag: string, body: string, close: string) => {
			preserved.push(body);
			return `${open}${MARK}${preserved.length - 1}${MARK}${close}`;
		},
	);
	const lines = masked.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		if (lines[index] !== "") lines[index] = indent + lines[index];
	}
	return lines
		.join("\n")
		.replace(PLACEHOLDER, (_match, index: string) => preserved[Number(index)]);
};

export type HtmlIncludeOptions = {
	/** プロジェクトルート。取り込みパスはここからの相対で解決する */
	root: string;
	/** 取り込んだファイルの絶対パスを、取り込むたびに受け取る */
	onInclude?: (path: string) => void;
};

/**
 * `<!-- @include <ルートからの相対パス> -->` を、そのファイルの内容へ置き換える。
 * 取り込み指示は 1 行を占める HTML コメントとして書く。パーシャルの中の
 * 取り込み指示も再帰的に解決する。
 */
export const resolveHtmlIncludes = (
	html: string,
	options: HtmlIncludeOptions,
	depth = 0,
): string => {
	if (depth > MAX_INCLUDE_DEPTH) {
		throw new Error(
			`@include の入れ子が ${MAX_INCLUDE_DEPTH} 段を超えました（循環参照の疑い）`,
		);
	}
	// [Intended] 再帰呼び出しと lastIndex を共有しないよう、呼び出しごとに作る
	const directive = /^([\t ]*)<!--[\t ]*@include[\t ]+(\S+)[\t ]*-->[\t ]*$/gm;
	const resolved = html.replace(
		directive,
		(_match: string, indent: string, specifier: string) => {
			const path = resolve(options.root, specifier);
			const inside = relative(options.root, path);
			if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
				throw new Error(
					`@include のパスがプロジェクトの外を指しています: ${specifier}`,
				);
			}
			options.onInclude?.(path);
			let content: string;
			try {
				content = readFileSync(path, "utf8");
			} catch (error) {
				// [Policy] tsconfig の target は ES2020 なので Error の cause は使えない
				throw new Error(
					`@include のパーシャルを読めません: ${specifier}: ${String(error)}`,
				);
			}
			// 末尾の改行はパーシャル側のファイル終端なので、差し込み時は落とす
			return indentLines(
				resolveHtmlIncludes(content.replace(/\n$/, ""), options, depth + 1),
				indent,
			);
		},
	);
	if (ANY_INCLUDE.test(resolved)) {
		throw new Error(
			"解決できない @include が残っています。取り込み指示は 1 行を占める HTML コメントとして書いてください",
		);
	}
	return resolved;
};

/** エントリの HTML を、パーシャルを取り込んだ 1 つの文字列として読む */
export const readHtmlWithIncludes = (root: string, entry: string): string =>
	resolveHtmlIncludes(readFileSync(resolve(root, entry), "utf8"), { root });

/** パーシャルディレクトリ配下の HTML を、絶対パスで列挙する */
const listPartialFiles = (directory: string): string[] => {
	let names: string[];
	try {
		names = readdirSync(directory, { recursive: true, encoding: "utf8" });
	} catch {
		// [Intended] パーシャルが 1 つも無い構成でもビルドは成立させる
		return [];
	}
	return names
		.filter((name) => name.endsWith(".html"))
		.map((name) => resolve(directory, name));
};

/**
 * パーシャル取り込みを行う Vite プラグイン。
 * [Intended] `order: "pre"` にして、Vite が script や asset の URL を解決する前に
 * 取り込みを済ませる。取り込んだ側と同じ扱いを受けさせるため。
 *
 * [Intended] パーシャルの変更で開発サーバーがページを再読み込みするのは Vite の
 * 既定動作に任せる。モジュールグラフに載らない `.html` の変更は Vite 自身が
 * full-reload を送るため、プラグイン側で送ると二重になる。パーシャルの拡張子を
 * `.html` 以外にすると、この既定動作から外れる。
 */
export const htmlIncludes = (): Plugin => {
	let root = process.cwd();
	return {
		name: "pixel-refiner:html-includes",
		configResolved(config) {
			root = config.root;
		},
		buildStart() {
			// [Intended] パーシャルはモジュールグラフに載らないので、監視対象へ明示的に
			// 登録しないと `vite build --watch` がパーシャルだけの変更を拾わず、出力が
			// 古いまま残る。取り込み済みの分だけでなくディレクトリ配下すべてを登録して、
			// 新しいパーシャルを足した場合も拾えるようにする。
			for (const path of listPartialFiles(
				resolve(root, HTML_PARTIALS_DIRECTORY),
			)) {
				this.addWatchFile(path);
			}
		},
		transformIndexHtml: {
			order: "pre",
			handler(html) {
				return resolveHtmlIncludes(html, { root });
			},
		},
	};
};
