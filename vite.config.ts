import { resolve } from "node:path";
import { defineConfig } from "vite";
import { htmlIncludes } from "./scripts/html-includes";

// [Workaround] Vercel プロジェクト再作成後の自動デプロイ経路を確認するための一時的な変更。
export default defineConfig({
	// [Intended] index.html を partials/ のパーシャルへ分割して読めるようにする。
	plugins: [htmlIncludes()],
	define: {
		"import.meta.env.APP_VERSION": JSON.stringify(
			process.env.npm_package_version,
		),
	},
	// [Intended] 本体アプリとレシピ集ページの 2 エントリを持つマルチページ構成。
	build: {
		rollupOptions: {
			input: {
				main: resolve(import.meta.dirname, "index.html"),
				guide: resolve(import.meta.dirname, "guide.html"),
			},
		},
	},
	// [Policy] dev サーバーの起動でブラウザを自動的に開かない。
	// 既に開いているタブやヘッドレスでの確認を邪魔しないため。
	server: {
		open: false,
	},
});
