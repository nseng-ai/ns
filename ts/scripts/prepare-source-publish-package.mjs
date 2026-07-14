#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { copyObjectivesPublishSkills } from "./objectives-publish-skills.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "..");
const repoRoot = resolve(workspaceRoot, "..");
const packageRoot = resolve(process.argv[2] ?? process.cwd());
const publishRoot = resolve(packageRoot, "dist", "publish");

const sourceManifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
const workspaceManifest = JSON.parse(await readFile(resolve(workspaceRoot, "package.json"), "utf8"));
const workspaceYaml = await readFile(resolve(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
const workspacePackages = await readWorkspacePackageVersions();
const catalog = readCatalog(workspaceYaml);

assertPackageCanPublish(sourceManifest);

await rm(publishRoot, { recursive: true, force: true });
await mkdir(publishRoot, { recursive: true });
await cp(resolve(packageRoot, "src"), resolve(publishRoot, "src"), { recursive: true });
await rewriteSdkImports(resolve(publishRoot, "src"));
await copyReadmeIfPresent(packageRoot, publishRoot);
if (sourceManifest.name === "@nseng-ai/objectives") {
	await copyObjectivesPublishSkills({ repoRoot, publishRoot });
}

const manifest = buildPublishManifest(sourceManifest);
await writeFile(resolve(publishRoot, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);

async function copyReadmeIfPresent(sourceRoot, targetRoot) {
	try {
		await cp(resolve(sourceRoot, "README.md"), resolve(targetRoot, "README.md"));
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
}

function assertPackageCanPublish(manifest) {
	if (typeof manifest.name !== "string" || !manifest.name.startsWith("@nseng-ai/")) {
		throw new Error(`Expected an @nseng-ai/* package name, got ${String(manifest.name)}`);
	}
	if (manifest.name === "@nseng-ai/ns") {
		throw new Error("@nseng-ai/ns uses its dedicated bundle publish pipeline.");
	}
	if (manifest.private === true) {
		throw new Error(`${manifest.name} is private; refusing to prepare a publish package.`);
	}
	if (manifest.type !== "module") {
		throw new Error(`${manifest.name} must keep type: module.`);
	}
	if (!Array.isArray(manifest.files) || !manifest.files.includes("src")) {
		throw new Error(`${manifest.name} publishable source manifest must include files: ["src"].`);
	}
}

function buildPublishManifest(manifest) {
	const output = {
		name: manifest.name,
		version: manifest.version,
		type: manifest.type,
		files: publishFiles(manifest),
		engines: workspaceManifest.engines,
		publishConfig: { access: "public" },
		...(manifest.exports === undefined ? {} : { exports: manifest.exports }),
		...rewriteDependencyBlock("dependencies", manifest.dependencies),
		...rewriteDependencyBlock("peerDependencies", manifest.peerDependencies),
		...(manifest.peerDependenciesMeta === undefined ? {} : { peerDependenciesMeta: manifest.peerDependenciesMeta }),
	};
	assertNoWorkspaceOrCatalogSpecifiers(output);
	return output;
}

function publishFiles(manifest) {
	if (manifest.name !== "@nseng-ai/objectives") return manifest.files;
	return [...manifest.files, "skills"];
}

function rewriteDependencyBlock(key, block) {
	if (block === undefined) return {};
	return { [key]: rewriteDependencies(block, { isPeer: key === "peerDependencies" }) };
}

function rewriteDependencies(block, options) {
	return Object.fromEntries(
		Object.entries(block).map(([name, specifier]) => rewriteDependencyEntry(name, String(specifier), options)),
	);
}

function rewriteDependencyEntry(name, specifier, options) {
	if (name === "@nseng-ai/sdk") {
		return ["@nseng-ai/ns", workspaceVersion("@nseng-ai/ns")];
	}
	return [name, rewriteDependencySpecifier(name, specifier, options)];
}

function rewriteDependencySpecifier(name, specifier, options) {
	if (specifier.startsWith("workspace:")) {
		const version = workspacePackages.get(name);
		if (version !== undefined) return version;
		if (options.isPeer) return "*";
		throw new Error(`Cannot rewrite workspace dependency ${name}; package is not versioned in this workspace.`);
	}
	if (specifier === "catalog:") {
		const version = catalog.get(name);
		if (version === undefined) {
			throw new Error(`Cannot rewrite catalog dependency ${name}; missing from pnpm-workspace.yaml catalog.`);
		}
		return version;
	}
	return specifier;
}

function workspaceVersion(name) {
	const version = workspacePackages.get(name);
	if (version === undefined) {
		throw new Error(`Cannot rewrite workspace dependency ${name}; package is not versioned in this workspace.`);
	}
	return version;
}

async function readWorkspacePackageVersions() {
	const packages = new Map();
	const candidates = [
		"packages/hosts/ns/package.json",
		"packages/capability-kit/package.json",
		"packages/capabilities/branch-context/package.json",
		"packages/capabilities/flow/package.json",
		"packages/capabilities/handoffs/package.json",
		"packages/capabilities/objectives/package.json",
		"packages/capabilities/plans/package.json",
		"packages/capabilities/pr-feedback/package.json",
		"packages/capabilities/retros/package.json",
		"packages/capabilities/reviews/package.json",
		"packages/capabilities/slots/package.json",
		"packages/infra/brmem/package.json",
		"packages/infra/clinkr/package.json",
		"packages/infra/foundation/package.json",
	];
	for (const candidate of candidates) {
		const path = resolve(workspaceRoot, candidate);
		const manifest = JSON.parse(await readFile(path, "utf8"));
		if (typeof manifest.name === "string" && typeof manifest.version === "string") {
			packages.set(manifest.name, manifest.version);
		}
	}
	return packages;
}

function readCatalog(source) {
	const versions = new Map();
	let inCatalog = false;
	for (const line of source.split("\n")) {
		if (line.trim() === "catalog:") {
			inCatalog = true;
			continue;
		}
		if (!inCatalog) continue;
		if (/^\S/u.test(line)) break;
		const match = /^\s{2}['"]?([^:'"]+)['"]?:\s*(.+?)\s*$/u.exec(line);
		if (match?.[1] !== undefined && match[2] !== undefined) {
			versions.set(match[1], match[2].replace(/^['"]|['"]$/gu, ""));
		}
	}
	return versions;
}

async function rewriteSdkImports(root) {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = resolve(root, entry.name);
		if (entry.isDirectory()) {
			await rewriteSdkImports(path);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
		const source = await readFile(path, "utf8");
		const rewritten = source
			.replaceAll('"@nseng-ai/sdk"', '"@nseng-ai/ns/sdk"')
			.replaceAll("@nseng-ai/sdk/", "@nseng-ai/ns/sdk/");
		if (rewritten !== source) await writeFile(path, rewritten);
	}
}

function assertNoWorkspaceOrCatalogSpecifiers(value) {
	const source = JSON.stringify(value);
	if (source.includes("workspace:") || source.includes("catalog:")) {
		throw new Error("Generated publish manifest must not include workspace: or catalog: specifiers.");
	}
	if (source.includes("@nseng-ai/sdk")) {
		throw new Error("Generated publish manifest must depend on @nseng-ai/ns/sdk*, not private @nseng-ai/sdk.");
	}
}

console.error(`Prepared ${sourceManifest.name} publish root at ${relative(process.cwd(), publishRoot)}`);
