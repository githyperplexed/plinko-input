import path from "path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";

// Inject the umami tracker only when the build environment defines both vars
// (e.g. the Cloudflare Pages project). Local builds and forks have neither, so
// they ship no tracker — and no analytics URL or website id lives in the repo.
const umami = (env: Record<string, string>): Plugin => ({
	name: "inject-umami",
	transformIndexHtml() {
		const src = env.VITE_UMAMI_SCRIPT_URL;
		const id = env.VITE_UMAMI_WEBSITE_ID;
		if (!src || !id) return;
		return [
			{
				tag: "script",
				attrs: { defer: true, src, "data-website-id": id },
				injectTo: "head"
			}
		];
	}
});

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "VITE_");
	return {
		base: "./",
		plugins: [tailwindcss(), svelte(), umami(env)],
		resolve: {
			alias: {
				$lib: path.resolve("./src/lib")
			}
		},
		build: {
			rollupOptions: {
				output: {
					entryFileNames: "[name]-[hash].js",
					chunkFileNames: "[name]-[hash].js",
					assetFileNames: "[name]-[hash].[ext]"
				}
			}
		}
	};
});
