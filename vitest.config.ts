import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// 測試環境沒有 Vite build 出來的靜態檔，用一份最小的 index.html 代替
const FIXTURE_HTML = `<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>夯肉</title><meta property="og:title" content="夯肉"></head><body><div id="app"></div></body></html>`;

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: "./wrangler.jsonc" },
			miniflare: {
				// 火力調到 1000 倍，燒毀測試幾十毫秒就會發生
				bindings: { HEAT_SCALE: "1000" },
				serviceBindings: {
					ASSETS: () => new Response(FIXTURE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
				},
			},
		}),
	],
	test: {
		include: ["test/**/*.test.ts"],
	},
});
