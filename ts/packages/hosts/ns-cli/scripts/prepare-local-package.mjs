#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publicRuntimeDependencies } from "./public-runtime-dependencies.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "..", "..", "..");
const publishRoot = resolve(packageRoot, "dist", "publish");
const bundledCli = resolve(packageRoot, "dist", "bundle", "cli.js");
const publishBinDir = resolve(publishRoot, "bin");
const publishBin = resolve(publishBinDir, "ns.js");
const sourceManifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const workspaceManifest = JSON.parse(await readFile(resolve(workspaceRoot, "package.json"), "utf8"));
const workspaceYaml = await readFile(resolve(workspaceRoot, "pnpm-workspace.yaml"), "utf8");

await rm(publishRoot, { recursive: true, force: true });
await mkdir(publishBinDir, { recursive: true });
await mkdir(resolve(publishBinDir, "prompts"), { recursive: true });
await copyFile(bundledCli, publishBin);
await copyFile(
	resolve(packageRoot, "dist", "bundle", "prompts", "branch-context-impl.md"),
	resolve(publishBinDir, "prompts", "branch-context-impl.md"),
);
await chmod(publishBin, 0o755);

const manifest = {
	name: "@nseng-ai/ns",
	version: sourceManifest.version,
	type: "module",
	bin: { ns: "./bin/ns.js" },
	files: ["bin", "README.md"],
	engines: { node: workspaceManifest.engines.node },
	dependencies: Object.fromEntries(
		publicRuntimeDependencies.map((name) => [name, catalogVersion(workspaceYaml, name)]),
	),
};

await writeFile(resolve(publishRoot, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
await writeFile(
	resolve(publishRoot, "README.md"),
	"# @nseng-ai/ns\n\nLocal checkout-free ns CLI package artifact.\n",
);

function catalogVersion(source, packageName) {
	const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^\\s*['"]?${escaped}['"]?:\\s*([^\\s#]+)`, "m");
	const match = pattern.exec(source);
	if (match?.[1] === undefined) {
		throw new Error(`Missing catalog version for ${packageName}`);
	}
	return match[1].replace(/^['"]|['"]$/g, "");
}
