#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publicRuntimeDependencies } from "./public-runtime-dependencies.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "..", "..", "..");
const publishRoot = resolve(packageRoot, "dist", "publish");
const bundledCli = resolve(packageRoot, "dist", "bundle", "cli.js");
const sourceManifestPath = resolve(packageRoot, "package.json");
const readmePath = resolve(packageRoot, "README.md");
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const workspaceManifest = JSON.parse(await readFile(resolve(workspaceRoot, "package.json"), "utf8"));
const workspaceYaml = await readFile(resolve(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
const kernelPublishExports = {
	"./kernel/cli": "./kernel/cli.js",
	"./kernel/command-io": "./kernel/command-io.js",
	"./kernel/context": "./kernel/context.js",
	"./kernel/pi-text-generation": "./kernel/pi-text-generation.js",
	"./kernel/sdk": "./kernel/sdk.js",
};

assertSourceManifest(sourceManifest, workspaceManifest);

const publishBinRelativePath = sourceManifest.bin.ns;
const publishBin = resolve(publishRoot, publishBinRelativePath);
const publishBinDir = dirname(publishBin);

await rm(publishRoot, { recursive: true, force: true });
await mkdir(publishBinDir, { recursive: true });
await mkdir(resolve(publishBinDir, "prompts"), { recursive: true });
await mkdir(resolve(publishRoot, "kernel"), { recursive: true });
await copyFile(bundledCli, publishBin);
await copyFile(
	resolve(packageRoot, "dist", "bundle", "prompts", "branch-context-impl.md"),
	resolve(publishBinDir, "prompts", "branch-context-impl.md"),
);
await copyFile(readmePath, resolve(publishRoot, "README.md"));
for (const exportPath of Object.values(kernelPublishExports)) {
	await copyFile(resolve(packageRoot, "dist", "bundle", exportPath.slice(2)), resolve(publishRoot, exportPath.slice(2)));
}
await chmod(publishBin, 0o755);

const manifest = {
	name: sourceManifest.name,
	version: sourceManifest.version,
	description: sourceManifest.description,
	type: sourceManifest.type,
	bin: sourceManifest.bin,
	exports: kernelPublishExports,
	files: sourceManifest.files,
	engines: sourceManifest.engines,
	dependencies: Object.fromEntries(
		publicRuntimeDependencies.map((name) => [name, catalogVersion(workspaceYaml, name)]),
	),
};

assertPublishManifest(manifest);

await writeFile(resolve(publishRoot, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);

function assertSourceManifest(manifest, workspaceManifest) {
	if (manifest.name !== "@nseng-ai/ns") {
		throw new Error(`Expected package name @nseng-ai/ns, got ${String(manifest.name)}`);
	}
	if (manifest.private === true) {
		throw new Error("@nseng-ai/ns source manifest must be publishable, but private is true.");
	}
	if (manifest.type !== "module") {
		throw new Error("@nseng-ai/ns source manifest must keep type: module.");
	}
	if (manifest.bin?.ns !== "bin/ns.js") {
		throw new Error("@nseng-ai/ns source manifest bin.ns must point at prebuilt bin/ns.js.");
	}
	if (manifest.bin.ns.includes("src/") || manifest.bin.ns.endsWith(".ts")) {
		throw new Error("@nseng-ai/ns source manifest bin.ns must not point at source TypeScript.");
	}
	if (
		!Array.isArray(manifest.files) ||
		!manifest.files.includes("bin") ||
		!manifest.files.includes("kernel") ||
		!manifest.files.includes("README.md")
	) {
		throw new Error("@nseng-ai/ns source manifest files must include bin, kernel, and README.md.");
	}
	for (const [subpath, sourceTarget] of Object.entries(manifest.exports ?? {})) {
		if (kernelPublishExports[subpath] === undefined) {
			throw new Error(`Unexpected @nseng-ai/ns source export ${subpath}.`);
		}
		if (sourceTarget !== `./src${kernelPublishExports[subpath].slice(1, -3)}.ts`) {
			throw new Error(`Unexpected @nseng-ai/ns source export target for ${subpath}: ${String(sourceTarget)}`);
		}
	}
	if (manifest.files.includes("src")) {
		throw new Error("@nseng-ai/ns source manifest files must not include src.");
	}
	if (manifest.engines?.node !== workspaceManifest.engines?.node) {
		throw new Error("@nseng-ai/ns source manifest engines.node must match the workspace node engine.");
	}
}

function assertPublishManifest(manifest) {
	if (manifest.private !== undefined) {
		throw new Error("Generated publish manifest must not include private.");
	}
	if (manifest.bin.ns !== "bin/ns.js") {
		throw new Error("Generated publish manifest bin.ns must point at bin/ns.js.");
	}
	for (const [subpath, publishTarget] of Object.entries(kernelPublishExports)) {
		if (manifest.exports[subpath] !== publishTarget) {
			throw new Error(`Generated publish manifest export ${subpath} must point at ${publishTarget}.`);
		}
	}
	for (const [name, specifier] of Object.entries(manifest.dependencies)) {
		if (String(specifier).startsWith("workspace:")) {
			throw new Error(`Generated publish dependency ${name} must not use a workspace: specifier.`);
		}
	}
}

function catalogVersion(source, packageName) {
	const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^\\s*['"]?${escaped}['"]?:\\s*([^\\s#]+)`, "m");
	const match = pattern.exec(source);
	if (match?.[1] === undefined) {
		throw new Error(`Missing catalog version for ${packageName}`);
	}
	return match[1].replace(/^['"]|['"]$/g, "");
}
