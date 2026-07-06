import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = resolve(workspaceRoot, "..");

export const intendedPublicPackages = [
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
	"@nseng-ai/ccc",
];

export const firstBatchPackages = ["@nseng-ai/capability-kit", "@nseng-ai/flow"];

export const excludedPackages = new Set([
	"@nseng-ai/pi",
	"@nseng-ai/pi-command-surfaces",
	"nscc",
	"@internal/pi-tools",
	"@internal/typescript-style-guard",
]);

export const publicPublishOrder = [
	"@nseng-ai/ns",
	"@nseng-ai/clinkr",
	"@nseng-ai/foundation",
	"@nseng-ai/capability-kit",
	"@nseng-ai/brmem",
	"@nseng-ai/plans",
	"@nseng-ai/branch-context",
	"@nseng-ai/objectives",
	"@nseng-ai/handoffs",
	"@nseng-ai/pr-feedback",
	"@nseng-ai/retros",
	"@nseng-ai/reviews",
	"@nseng-ai/slots",
	"@nseng-ai/packagechk",
	"@nseng-ai/vibechk",
	"@nseng-ai/flow",
	"@nseng-ai/ccc",
	"@nseng-ai/command-backed-skill-registry",
	"@nseng-ai/areg",
];

export async function loadPublicPackageContext() {
	const workspaceManifest = await readJson(resolve(workspaceRoot, "package.json"));
	const workspaceYaml = await readFile(resolve(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
	const packageManifests = await readWorkspacePackageManifests();
	const manifestByName = new Map(packageManifests.map((entry) => [entry.manifest.name, entry]));
	assertIntendedSet(manifestByName);
	assertNsKernelExports(manifestByName);
	return { workspaceManifest, workspaceYaml, packageManifests, manifestByName };
}

export async function readWorkspacePackageManifests() {
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

export async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

export function assertPlausibleNpmVersion(version) {
	if (typeof version !== "string" || version.trim() !== version || version.length === 0) {
		throw new Error("VERSION must be a non-empty npm semver value without surrounding whitespace");
	}
	const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
	if (!semverPattern.test(version)) {
		throw new Error(`VERSION must look like a concrete npm semver version, got: ${version}`);
	}
}

export function assertCoordinatedVersion(context, version) {
	assertPlausibleNpmVersion(version);
	const mismatches = [];
	for (const packageName of intendedPublicPackages) {
		const manifest = context.manifestByName.get(packageName)?.manifest;
		if (manifest === undefined) throw new Error(`Intended public package is missing: ${packageName}`);
		if (manifest.version !== version) mismatches.push(`${packageName}: ${manifest.version ?? "<missing>"}`);
	}
	if (mismatches.length > 0) {
		throw new Error(`Intended public package versions do not all match ${version}:\n- ${mismatches.join("\n- ")}`);
	}
}

export function buildPublishPlan(context, version) {
	assertCoordinatedVersion(context, version);
	assertPublishOrder();
	return publicPublishOrder.map((packageName) => {
		const entry = context.manifestByName.get(packageName);
		if (entry === undefined) throw new Error(`Unknown workspace package ${packageName}`);
		return {
			packageName,
			version,
			publishRoot: publishRootForEntry(entry),
			command: `npm publish ${publishRootForEntry(entry)} --access public`,
		};
	});
}

export function printPublishPlan(plan) {
	console.log("Public package publish plan:");
	for (const [index, item] of plan.entries()) {
		console.log(`${index + 1}. ${item.packageName}@${item.version}`);
		console.log(`   root: ${item.publishRoot}`);
		console.log(`   command: npm publish <root> --access public`);
	}
}

export async function preparePublishRoot(entry, context) {
	if (entry.manifest.name === "@nseng-ai/ns") throw new Error("@nseng-ai/ns publish root is prepared by its package script");
	const publishRoot = publishRootForEntry(entry);
	await rm(publishRoot, { recursive: true, force: true });
	await mkdir(publishRoot, { recursive: true });
	for (const fileEntry of entry.manifest.files ?? []) {
		await cp(resolve(entry.root, fileEntry), resolve(publishRoot, fileEntry), { recursive: true });
	}
	await rewritePublishedKernelImports(publishRoot);
	const manifest = buildPublishManifest(entry.manifest, context);
	assertPublishManifest(manifest);
	await writeFile(resolve(publishRoot, "package.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
	return publishRoot;
}

export function publishRootForEntry(entry) {
	return resolve(entry.root, "dist", "publish");
}

export function buildPublishManifest(sourceManifest, context) {
	const manifest = {
		name: sourceManifest.name,
		version: sourceManifest.version,
		type: sourceManifest.type,
		files: sourceManifest.files,
		engines: context.workspaceManifest.engines,
		publishConfig: { access: "public" },
		...(sourceManifest.bin === undefined ? {} : { bin: normalizeBinPaths(sourceManifest.bin) }),
		...(sourceManifest.exports === undefined ? {} : { exports: sourceManifest.exports }),
		dependencies: rewriteDependencyBlock(sourceManifest.dependencies ?? {}, context),
	};
	const optionalDependencies = rewriteDependencyBlock(sourceManifest.optionalDependencies ?? {}, context);
	const peerDependencies = rewritePeerDependencyBlock(sourceManifest.peerDependencies ?? {}, context);
	return {
		...manifest,
		...(Object.keys(optionalDependencies).length === 0 ? {} : { optionalDependencies }),
		...(Object.keys(peerDependencies).length === 0 ? {} : { peerDependencies }),
		...(sourceManifest.peerDependenciesMeta === undefined ? {} : { peerDependenciesMeta: sourceManifest.peerDependenciesMeta }),
	};
}

export function run(command, args, options = {}) {
	console.log(`$ ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, { ...options, stdio: "inherit" });
	if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
}

function assertPublishOrder() {
	const seen = new Set(publicPublishOrder);
	const missing = intendedPublicPackages.filter((packageName) => !seen.has(packageName));
	const extra = publicPublishOrder.filter((packageName) => !intendedPublicPackages.includes(packageName));
	if (seen.size !== publicPublishOrder.length) throw new Error("Explicit publish order contains duplicate packages");
	if (missing.length > 0 || extra.length > 0) {
		throw new Error(`Explicit publish order does not match intended public set. Missing: ${missing.join(", ")}; extra: ${extra.join(", ")}`);
	}
	if (publicPublishOrder[0] !== "@nseng-ai/ns") throw new Error("@nseng-ai/ns must publish first for @nseng-ai/ns/kernel/* dependents");
}

function normalizeBinPaths(bin) {
	if (typeof bin === "string") return stripLeadingCurrentDirectory(bin);
	if (bin !== null && typeof bin === "object" && !Array.isArray(bin)) {
		return Object.fromEntries(Object.entries(bin).map(([name, target]) => [name, stripLeadingCurrentDirectory(target)]));
	}
	return bin;
}

function stripLeadingCurrentDirectory(value) {
	return typeof value === "string" ? value.replace(/^\.\//, "") : value;
}

function rewriteDependencyBlock(dependencies, context) {
	const rewrittenDependencies = {};
	for (const [name, specifier] of Object.entries(dependencies)) {
		const rewritten = rewriteDependency(name, specifier, context);
		rewrittenDependencies[rewritten.name] = rewritten.specifier;
	}
	return rewrittenDependencies;
}

function rewritePeerDependencyBlock(dependencies, context) {
	const rewrittenDependencies = {};
	for (const [name, specifier] of Object.entries(dependencies)) {
		if (name === "@nseng-ai/pi") {
			rewrittenDependencies[name] = "*";
			continue;
		}
		const rewritten = rewriteDependency(name, specifier, context);
		rewrittenDependencies[rewritten.name] = rewritten.specifier;
	}
	return rewrittenDependencies;
}

function rewriteDependency(name, specifier, context) {
	if (name === "@nseng-ai/kernel") {
		const nsManifest = context.manifestByName.get("@nseng-ai/ns")?.manifest;
		if (nsManifest === undefined) throw new Error("Missing workspace manifest for @nseng-ai/ns");
		return { name: "@nseng-ai/ns", specifier: nsManifest.version };
	}
	if (excludedPackages.has(name)) throw new Error(`Publish manifest must not depend on excluded package ${name}`);
	if (specifier === "workspace:*") {
		const dependencyManifest = context.manifestByName.get(name)?.manifest;
		if (dependencyManifest === undefined) throw new Error(`Missing workspace manifest for ${name}`);
		if (!intendedPublicPackages.includes(name)) throw new Error(`${name} is not in the intended public package set`);
		return { name, specifier: dependencyManifest.version };
	}
	if (specifier === "catalog:") return { name, specifier: catalogVersion(context.workspaceYaml, name) };
	return { name, specifier };
}

async function rewritePublishedKernelImports(root) {
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = resolve(root, entry.name);
		if (entry.isDirectory()) {
			await rewritePublishedKernelImports(path);
			continue;
		}
		if (![".js", ".mjs", ".ts", ".tsx"].includes(extname(entry.name))) continue;
		const source = await readFile(path, "utf8");
		const rewritten = source.replaceAll("@nseng-ai/kernel/", "@nseng-ai/ns/kernel/");
		if (rewritten !== source) await writeFile(path, rewritten);
	}
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
