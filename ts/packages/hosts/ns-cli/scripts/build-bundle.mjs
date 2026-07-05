#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(packageRoot, "dist", "bundle", "cli.js");
const bundleEntry = resolve(packageRoot, "dist", "bundle-entry.mjs");
const bundledPromptsDir = resolve(packageRoot, "dist", "bundle", "prompts");

await mkdir(dirname(outfile), { recursive: true });
await writeFile(
	bundleEntry,
	[
		"// Disable nested source CLI entrypoint fallbacks while bundled modules initialize.",
		"const directArgvPath = process.argv[1];",
		'process.argv[1] = "";',
		'const { runNsCli } = await import("../src/cli.ts");',
		"process.argv[1] = directArgvPath;",
		"process.exitCode = await runNsCli(process.argv.slice(2));",
		"",
	].join("\n"),
);
await build({
	entryPoints: [bundleEntry],
	outfile,
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	external: [
		"@earendil-works/pi-ai",
		"@earendil-works/pi-coding-agent",
		"jiti",
		"zod",
	],
	banner: {
		js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
	},
	define: { "import.meta.main": "false" },
	logLevel: "info",
});

const bundled = await readFile(outfile, "utf8");
if (!bundled.startsWith("#!/usr/bin/env node\n")) {
	await writeFile(outfile, `#!/usr/bin/env node\n${bundled}`);
}
await chmod(outfile, 0o755);
await copyRuntimeAssets();

async function copyRuntimeAssets() {
	await mkdir(bundledPromptsDir, { recursive: true });
	await copyFile(
		resolve(
			packageRoot,
			"..",
			"..",
			"capabilities",
			"branch-context",
			"src",
			"core",
			"prompts",
			"branch-context-impl.md",
		),
		resolve(bundledPromptsDir, "branch-context-impl.md"),
	);
}
