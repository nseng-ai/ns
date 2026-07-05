#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { branchContextImplPromptTemplatePath } from "@nseng-ai/branch-context/api/prompt-assets";
import { build } from "esbuild";

import { publicRuntimeDependencies } from "./public-runtime-dependencies.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundleRoot = resolve(packageRoot, "dist", "bundle");
const outfile = resolve(bundleRoot, "cli.js");
const bundleEntry = resolve(packageRoot, "dist", "bundle-entry.mjs");
const bundledPromptsDir = resolve(bundleRoot, "prompts");
const kernelExportEntries = {
	"kernel/cli": resolve(packageRoot, "src", "kernel", "cli.ts"),
	"kernel/command-io": resolve(packageRoot, "src", "kernel", "command-io.ts"),
	"kernel/context": resolve(packageRoot, "src", "kernel", "context.ts"),
	"kernel/pi-text-generation": resolve(packageRoot, "src", "kernel", "pi-text-generation.ts"),
	"kernel/sdk": resolve(packageRoot, "src", "kernel", "sdk.ts"),
};

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
	external: publicRuntimeDependencies,
	banner: {
		js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
	},
	define: { "import.meta.main": "false" },
	logLevel: "info",
});
await build({
	entryPoints: kernelExportEntries,
	outdir: bundleRoot,
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node24",
	external: publicRuntimeDependencies,
	banner: {
		js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
	},
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
		branchContextImplPromptTemplatePath(),
		resolve(bundledPromptsDir, "branch-context-impl.md"),
	);
}
