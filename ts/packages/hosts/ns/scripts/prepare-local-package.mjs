#!/usr/bin/env node
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { catalogVersion } from "@internal/ns-dev/public-packages/catalog-version";
import { nsPublishBin } from "@internal/ns-dev/public-packages/ns-publish-bin";
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
const publishExports = {
	"./cli": "./cli/index.js",
	"./sdk": "./sdk/sdk.js",
	"./sdk/cli": "./sdk/cli.js",
	"./sdk/command-io": "./sdk/command-io.js",
	"./sdk/context": "./sdk/context.js",
};

assertSourceManifest(sourceManifest, workspaceManifest);

const publishBinRelativePath = nsPublishBin.ns;
const publishBin = resolve(publishRoot, publishBinRelativePath);
const publishBinDir = dirname(publishBin);

await rm(publishRoot, { recursive: true, force: true });
await mkdir(publishBinDir, { recursive: true });
await mkdir(resolve(publishBinDir, "prompts"), { recursive: true });
await mkdir(resolve(publishRoot, "cli"), { recursive: true });
await mkdir(resolve(publishRoot, "sdk"), { recursive: true });
await copyFile(bundledCli, publishBin);
await copyFile(
	resolve(packageRoot, "dist", "bundle", "prompts", "branch-context-impl.md"),
	resolve(publishBinDir, "prompts", "branch-context-impl.md"),
);
await copyFile(readmePath, resolve(publishRoot, "README.md"));
for (const exportPath of Object.values(publishExports)) {
	await copyFile(resolve(packageRoot, "dist", "bundle", exportPath.slice(2)), resolve(publishRoot, exportPath.slice(2)));
}
await chmod(publishBin, 0o755);

const manifest = {
	name: sourceManifest.name,
	version: sourceManifest.version,
	description: sourceManifest.description,
	type: sourceManifest.type,
	bin: nsPublishBin,
	exports: publishExports,
	files: sourceManifest.files,
	publishConfig: sourceManifest.publishConfig,
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
	if (manifest.bin !== undefined) {
		throw new Error("@nseng-ai/ns source manifest must not advertise a bin; the publish artifact adds it.");
	}
	if (
		!Array.isArray(manifest.files) ||
		!manifest.files.includes("bin") ||
		!manifest.files.includes("cli") ||
		!manifest.files.includes("sdk") ||
		!manifest.files.includes("README.md")
	) {
		throw new Error("@nseng-ai/ns source manifest files must include bin, cli, sdk, and README.md.");
	}
	for (const [subpath, sourceTarget] of Object.entries(manifest.exports ?? {})) {
		if (publishExports[subpath] === undefined) {
			throw new Error(`Unexpected @nseng-ai/ns source export ${subpath}.`);
		}
		if (sourceTarget !== `./src${publishExports[subpath].slice(1, -3)}.ts`) {
			throw new Error(`Unexpected @nseng-ai/ns source export target for ${subpath}: ${String(sourceTarget)}`);
		}
	}
	if (manifest.files.includes("src")) {
		throw new Error("@nseng-ai/ns source manifest files must not include src.");
	}
	if (manifest.scripts?.prepublishOnly === undefined) {
		throw new Error("@nseng-ai/ns source manifest must guard raw package-root publishing with prepublishOnly.");
	}
	if (manifest.publishConfig?.access !== "public") {
		throw new Error("@nseng-ai/ns source manifest publishConfig.access must be public.");
	}
	if (manifest.engines?.node !== workspaceManifest.engines?.node) {
		throw new Error("@nseng-ai/ns source manifest engines.node must match the workspace node engine.");
	}
}

function assertPublishManifest(manifest) {
	if (manifest.private !== undefined) {
		throw new Error("Generated publish manifest must not include private.");
	}
	if (manifest.scripts !== undefined) {
		throw new Error("Generated publish manifest must not include source package scripts.");
	}
	if (manifest.bin?.ns !== nsPublishBin.ns || Object.keys(manifest.bin).length !== 1) {
		throw new Error(`Generated publish manifest bin must equal ${JSON.stringify(nsPublishBin)}.`);
	}
	for (const [subpath, publishTarget] of Object.entries(publishExports)) {
		if (manifest.exports[subpath] !== publishTarget) {
			throw new Error(`Generated publish manifest export ${subpath} must point at ${publishTarget}.`);
		}
	}
	if (manifest.publishConfig?.access !== "public") {
		throw new Error("Generated publish manifest publishConfig.access must be public.");
	}
	for (const [name, specifier] of Object.entries(manifest.dependencies)) {
		if (String(specifier).startsWith("workspace:") || String(specifier).startsWith("catalog:")) {
			throw new Error(`Generated publish dependency ${name} must not use a workspace: or catalog: specifier.`);
		}
	}
}
