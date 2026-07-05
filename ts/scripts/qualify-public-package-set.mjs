#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(workspaceRoot, "..");

const intendedPublicPackages = [
	"@nseng-ai/branch-context",
	"@nseng-ai/handoffs",
	"@nseng-ai/objectives",
	"@nseng-ai/plans",
	"@nseng-ai/pr-feedback",
	"@nseng-ai/retros",
	"@nseng-ai/reviews",
	"@nseng-ai/slots",
	"@nseng-ai/command-backed-skill-registry",
	"@nseng-ai/ns",
	"@nseng-ai/brmem",
	"@nseng-ai/clinkr",
	"@nseng-ai/foundation",
	"@nseng-ai/areg",
	"@nseng-ai/packagechk",
	"@nseng-ai/vibechk",
	"@nseng-ai/capability-kit",
	"@nseng-ai/flow",
];

const firstBatchPackages = ["@nseng-ai/capability-kit", "@nseng-ai/flow"];

const excludedPackages = new Set([
	"@nseng-ai/kernel",
	"@nseng-ai/ccc",
	"@nseng-ai/pi",
	"@nseng-ai/pi-command-surfaces",
	"nscc",
	"@internal/pi-tools",
	"@internal/typescript-style-guard",
]);

const args = new Set(process.argv.slice(2));
const shouldSkipChecks = args.has("--skip-checks");
const shouldSkipDryRun = args.has("--skip-dry-run");
const packagesToQualify = args.has("--all") ? intendedPublicPackages : firstBatchPackages;

const workspaceManifest = await readJson(resolve(workspaceRoot, "package.json"));
const workspaceYaml = await readFile(resolve(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
const packageManifests = await readWorkspacePackageManifests();
const manifestByName = new Map(packageManifests.map((entry) => [entry.manifest.name, entry]));

assertIntendedSet(manifestByName);
assertNsKernelExports(manifestByName);

console.log("Intended public package set:");
for (const packageName of intendedPublicPackages) console.log(`- ${packageName}`);
console.log("");
console.log(`Qualifying ${packagesToQualify.length} package(s): ${packagesToQualify.join(", ")}`);

for (const packageName of packagesToQualify) {
	const entry = manifestByName.get(packageName);
	if (entry === undefined) throw new Error(`Unknown workspace package ${packageName}`);
	if (!shouldSkipChecks) {
		run("pnpm", ["--dir", "ts", "--filter", packageName, "run", "check"], { cwd: repoRoot });
		run("pnpm", ["--dir", "ts", "--filter", packageName, "run", "test"], { cwd: repoRoot });
	}
	const publishRoot = await preparePublishRoot(entry, manifestByName);
	if (!shouldSkipDryRun) run("npm", ["publish", "--dry-run", publishRoot], { cwd: repoRoot });
}

console.log("Public package qualification completed without registry writes.");

async function readWorkspacePackageManifests() {
	const result = spawnSync(
		"find",
		[
			"packages",
			"-maxdepth",
			"4",
			"-name",
			"package.json",
			"-not",
			"-path",
			"*/node_modules/*",
			"-not",
			"-path",
			"*/dist/*",
		],
		{ cwd: workspaceRoot, encoding: "utf8" },
	);
	if (result.status !== 0) throw new Error(result.stderr || "failed to list workspace package manifests");
	const paths = result.stdout.trim().split("\n").filter(Boolean).sort();
	const entries = [];
	for (const relativePath of paths) {
		const path = resolve(workspaceRoot, relativePath);
		entries.push({ path, root: dirname(path), manifest: await readJson(path) });
	}
	return entries;
}

async function preparePublishRoot(entry, manifestByName) {
	const publishRoot = resolve(entry.root, "dist", "publish");
	await rm(publishRoot, { recursive: true, force: true });
	await mkdir(publishRoot, { recursive: true });
	for (const fileEntry of entry.manifest.files ?? []) {
		await cp(resolve(entry.root, fileEntry), resolve(publishRoot, fileEntry), { recursive: true });
	}
	const manifest = buildPublishManifest(entry.manifest, manifestByName);
	assertPublishManifest(manifest);
	await writeFile(resolve(publishRoot, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	return publishRoot;
}

function buildPublishManifest(sourceManifest, manifestByName) {
	const manifest = {
		name: sourceManifest.name,
		version: sourceManifest.version,
		type: sourceManifest.type,
		files: sourceManifest.files,
		engines: workspaceManifest.engines,
		publishConfig: { access: "public" },
		...(sourceManifest.bin === undefined ? {} : { bin: sourceManifest.bin }),
		...(sourceManifest.exports === undefined ? {} : { exports: sourceManifest.exports }),
		dependencies: rewriteDependencyBlock(sourceManifest.dependencies ?? {}, manifestByName),
	};
	const optionalDependencies = rewriteDependencyBlock(sourceManifest.optionalDependencies ?? {}, manifestByName);
	const peerDependencies = rewritePeerDependencyBlock(sourceManifest.peerDependencies ?? {}, manifestByName);
	return {
		...manifest,
		...(Object.keys(optionalDependencies).length === 0 ? {} : { optionalDependencies }),
		...(Object.keys(peerDependencies).length === 0 ? {} : { peerDependencies }),
		...(sourceManifest.peerDependenciesMeta === undefined ? {} : { peerDependenciesMeta: sourceManifest.peerDependenciesMeta }),
	};
}

function rewriteDependencyBlock(dependencies, manifestByName) {
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, specifier]) => [name, rewriteDependencySpecifier(name, specifier, manifestByName)]),
	);
}

function rewritePeerDependencyBlock(dependencies, manifestByName) {
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, specifier]) => {
			if (name === "@nseng-ai/pi") return [name, "*"];
			return [name, rewriteDependencySpecifier(name, specifier, manifestByName)];
		}),
	);
}

function rewriteDependencySpecifier(name, specifier, manifestByName) {
	if (excludedPackages.has(name)) throw new Error(`Publish manifest must not depend on excluded package ${name}`);
	if (specifier === "workspace:*") {
		const dependencyManifest = manifestByName.get(name)?.manifest;
		if (dependencyManifest === undefined) throw new Error(`Missing workspace manifest for ${name}`);
		if (!intendedPublicPackages.includes(name)) throw new Error(`${name} is not in the intended public package set`);
		return dependencyManifest.version;
	}
	if (specifier === "catalog:") return catalogVersion(workspaceYaml, name);
	return specifier;
}

function assertPublishManifest(manifest) {
	if (manifest.private !== undefined) throw new Error(`${manifest.name} publish manifest must not include private`);
	for (const blockName of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
		const block = manifest[blockName] ?? {};
		for (const [name, specifier] of Object.entries(block)) {
			if (excludedPackages.has(name) && !(blockName === "peerDependencies" && name === "@nseng-ai/pi")) {
				throw new Error(`${manifest.name} ${blockName} leaks excluded package ${name}`);
			}
			if (String(specifier).startsWith("workspace:")) throw new Error(`${manifest.name} ${blockName}.${name} uses workspace:`);
			if (String(specifier).startsWith("catalog:")) throw new Error(`${manifest.name} ${blockName}.${name} uses catalog:`);
		}
	}
}

function assertIntendedSet(manifestByName) {
	for (const packageName of intendedPublicPackages) {
		const manifest = manifestByName.get(packageName)?.manifest;
		if (manifest === undefined) throw new Error(`Intended public package is missing: ${packageName}`);
		if (manifest.private === true) throw new Error(`Intended public package is still private: ${packageName}`);
	}
}

function assertNsKernelExports(manifestByName) {
	const nsManifest = manifestByName.get("@nseng-ai/ns")?.manifest;
	const exports = nsManifest?.exports ?? {};
	for (const subpath of ["./kernel/cli", "./kernel/command-io", "./kernel/context", "./kernel/pi-text-generation", "./kernel/sdk"]) {
		if (exports[subpath] === undefined) throw new Error(`@nseng-ai/ns source manifest is missing ${subpath}`);
	}
}

function catalogVersion(source, packageName) {
	const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`^\\s*['"]?${escaped}['"]?:\\s*([^\\s#]+)`, "m");
	const match = pattern.exec(source);
	if (match?.[1] === undefined) throw new Error(`Missing catalog version for ${packageName}`);
	return match[1].replace(/^['"]|['"]$/g, "");
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function run(command, args, options) {
	console.log(`$ ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, { ...options, stdio: "inherit" });
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
}
