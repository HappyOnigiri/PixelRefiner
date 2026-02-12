import { defineConfig } from "vite";

export default defineConfig({
	define: {
		"import.meta.env.APP_VERSION": JSON.stringify(
			process.env.npm_package_version,
		),
	},
	server: {
		open: true,
	},
});
