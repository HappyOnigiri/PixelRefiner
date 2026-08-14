import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
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
	server: {
		open: true,
	},
});
