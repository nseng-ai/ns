import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isRecord, optionalEntries } from "@nseng-ai/foundation/primitives";

import {
	MAX_PACKAGE_TREE_WALK_DEPTH,
	realFileSystemGateway,
	type FileSystemGateway,
} from "../context.ts";
import { copyTree } from "./files.ts";
import { catalogVersion } from "./catalog-version.ts";
import { normalizeManifestBinPaths } from "./helpers.ts";
import {
	copyPublishExtras,
	filesWithPublishExtras,
	publishExtrasManifestMetadata,
	validatePublishExtras,
	type ValidatedPublishExtra,
} from "./publish-extras.ts";
import { sdkFoldEntries, sdkPublicExports } from "./sdk-public-subpaths.ts";

export const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
export const repoRoot = resolve(workspaceRoot, "..");

export const intendedPublicPackages: readonly string[] = [
	"@nseng-ai/branch-context",
	"@nseng-ai/handoffs",
	"@nseng-ai/sdk",
	"@nseng-ai/objectives",
	"@nseng-ai/plans",
	"@nseng-ai/pr-feedback",
	"@nseng-ai/reviews",
	"@nseng-ai/slots",
	"@nseng-ai/ns",
	"@nseng-ai/brmem",
	"@nseng-ai/clinkr",
	"@nseng-ai/foundation",
	"@nseng-ai/packagechk",
	"@nseng-ai/vibechk",
	"@nseng-ai/extension-kit",
	"@nseng-ai/harness-artifacts",
	"@nseng-ai/flow",
	"@internal/pi-editor-mods",
];
export const firstBatchPackages: readonly string[] = ["@nseng-ai/extension-kit", "@nseng-ai/flow"];
export const excludedPackages = new Set([
	"@nseng-ai/pi-runtime",
	"@internal/pi-tools",
	"@internal/typescript-style-guard",
]);
export const publicPublishOrder: readonly string[] = [
	"@nseng-ai/clinkr",
	"@nseng-ai/foundation",
	"@nseng-ai/sdk",
	"@nseng-ai/extension-kit",
	"@nseng-ai/harness-artifacts",
	"@nseng-ai/brmem",
	"@nseng-ai/plans",
	"@nseng-ai/branch-context",
	"@nseng-ai/objectives",
	"@nseng-ai/handoffs",
	"@nseng-ai/pr-feedback",
	"@nseng-ai/reviews",
	"@nseng-ai/slots",
	"@nseng-ai/ns",
	"@nseng-ai/packagechk",
	"@nseng-ai/vibechk",
	"@nseng-ai/flow",
	"@internal/pi-editor-mods",
];

export interface PackageManifest extends Record<string, unknown> {
	readonly name: string;
	readonly version?: string;
	readonly private?: boolean;
	readonly type?: string;
	readonly files?: readonly string[];
	readonly keywords?: readonly string[];
	readonly pi?: unknown;
	readonly bundledDependencies?: readonly string[];
	readonly bin?: unknown;
	readonly exports?: Record<string, unknown>;
	readonly dependencies?: Record<string, unknown>;
	readonly optionalDependencies?: Record<string, unknown>;
	readonly peerDependencies?: Record<string, unknown>;
	readonly peerDependenciesMeta?: unknown;
}
export interface PublicPackageEntry {
	readonly path: string;
	readonly root: string;
	readonly manifest: PackageManifest;
}
export interface PublicPackageContext {
	readonly workspaceManifest: Record<string, unknown>;
	readonly workspaceYaml: string;
	readonly packageManifests: readonly PublicPackageEntry[];
	readonly manifestByName: ReadonlyMap<string, PublicPackageEntry>;
}
export interface PublishPlanEntry {
	readonly packageName: string;
	readonly version: string;
	readonly publishRoot: string;
}

export async function loadPublicPackageContext(
	fs: FileSystemGateway = realFileSystemGateway,
): Promise<PublicPackageContext> {
	const workspaceManifest = await readJson(fs, workspaceRoot + "/package.json");
	const workspaceYaml = await fs.readText(workspaceRoot + "/pnpm-workspace.yaml");
	const packageManifests = await readWorkspacePackageManifests(fs);
	const manifestByName = new Map(packageManifests.map((entry) => [entry.manifest.name, entry]));
	assertIntendedSet(manifestByName);
	assertSdkExports(manifestByName);
	return { workspaceManifest, workspaceYaml, packageManifests, manifestByName };
}

export async function readWorkspacePackageManifests(
	fs: FileSystemGateway = realFileSystemGateway,
): Promise<PublicPackageEntry[]> {
	const packageRoot = resolve(workspaceRoot, "packages");
	const paths = await collectManifestPaths(fs, packageRoot, 0);
	const entries: PublicPackageEntry[] = [];
	for (const path of paths.sort())
		entries.push({
			path,
			root: dirname(path),
			manifest: decodePackageManifest(await readJson(fs, path), path),
		});
	return entries;
}

export async function readJson(
	fs: FileSystemGateway,
	path: string,
): Promise<Record<string, unknown>> {
	const parsed: unknown = JSON.parse(await fs.readText(path));
	if (!isRecord(parsed)) throw new Error(`Expected ${path} to contain a JSON object`);
	return parsed;
}

const concreteNpmVersionPattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
export function isConcreteNpmVersion(version: unknown): version is string {
	return (
		typeof version === "string" &&
		version.trim() === version &&
		concreteNpmVersionPattern.test(version)
	);
}
export function assertPlausibleNpmVersion(version: unknown): asserts version is string {
	if (!isConcreteNpmVersion(version))
		throw new Error(`VERSION must be a concrete npm semver version, got: ${String(version)}`);
}
export function assertCoordinatedVersion(context: PublicPackageContext, version: string): void {
	assertPlausibleNpmVersion(version);
	const mismatches = intendedPublicPackages.flatMap((name) =>
		context.manifestByName.get(name)?.manifest.version === version
			? []
			: [`${name}: ${context.manifestByName.get(name)?.manifest.version ?? "<missing>"}`],
	);
	if (mismatches.length > 0)
		throw new Error(
			`Intended public package versions do not all match ${version}:\n- ${mismatches.join("\n- ")}`,
		);
}
export function buildPublishPlan(
	context: PublicPackageContext,
	version: string,
): PublishPlanEntry[] {
	assertCoordinatedVersion(context, version);
	assertPublishOrder();
	return publicPublishOrder.map((packageName) => {
		const entry = context.manifestByName.get(packageName);
		if (entry === undefined) throw new Error(`Unknown workspace package ${packageName}`);
		return { packageName, version, publishRoot: publishRootForEntry(entry) };
	});
}
export function publishRootForEntry(entry: PublicPackageEntry): string {
	return resolve(entry.root, "dist", "publish");
}

export async function preparePublishRoot(
	entry: PublicPackageEntry,
	context: PublicPackageContext,
	fs: FileSystemGateway = realFileSystemGateway,
): Promise<string> {
	if (entry.manifest.name === "@nseng-ai/ns")
		throw new Error("@nseng-ai/ns publish root is prepared by its package script");
	const publishRoot = publishRootForEntry(entry);
	const extras = await validatePublishExtras(
		{
			manifest: entry.manifest,
			sourceRoot: repoRoot,
			publishRoot,
		},
		fs,
	);
	await fs.rmrf(publishRoot);
	await fs.mkdirp(publishRoot);
	for (const fileEntry of entry.manifest.files ?? [])
		await copyTree(fs, resolve(entry.root, fileEntry), resolve(publishRoot, fileEntry));
	await copyPublishExtras(extras, fs);
	const manifest = buildPublishManifest(entry.manifest, context, extras);
	assertPublishManifest(manifest);
	await fs.writeText(
		resolve(publishRoot, "package.json"),
		`${JSON.stringify(manifest, null, "\t")}\n`,
	);
	return publishRoot;
}

export function buildPublishManifest(
	source: PackageManifest,
	context: PublicPackageContext,
	extras: readonly ValidatedPublishExtra[] = [],
): Record<string, unknown> {
	const manifest: Record<string, unknown> = {
		name: source.name,
		version: source.version,
		type: source.type,
		files: filesWithPublishExtras(source.files ?? [], extras),
		...optionalEntries({
			keywords: source.keywords,
			pi: source.pi,
			bundledDependencies: source.bundledDependencies,
		}),
		engines: context.workspaceManifest.engines,
		publishConfig: { access: "public" },
		...(source.bin === undefined ? {} : { bin: normalizeManifestBinPaths(source.bin) }),
		...(source.exports === undefined ? {} : { exports: source.exports }),
		dependencies: rewriteDependencyBlock(source.dependencies ?? {}, context),
		...publishExtrasManifestMetadata(extras),
	};
	const optionalDependencies = rewriteDependencyBlock(source.optionalDependencies ?? {}, context);
	const peerDependencies = rewritePeerDependencyBlock(source.peerDependencies ?? {}, context);
	return {
		...manifest,
		...(Object.keys(optionalDependencies).length === 0 ? {} : { optionalDependencies }),
		...(Object.keys(peerDependencies).length === 0 ? {} : { peerDependencies }),
		...(source.peerDependenciesMeta === undefined
			? {}
			: { peerDependenciesMeta: source.peerDependenciesMeta }),
	};
}

function rewriteDependencyBlock(
	dependencies: Record<string, unknown>,
	context: PublicPackageContext,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, value]) => [
			name,
			rewriteDependency(name, String(value), context),
		]),
	);
}
function rewritePeerDependencyBlock(
	dependencies: Record<string, unknown>,
	context: PublicPackageContext,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(dependencies).map(([name, value]) => [
			name,
			name === "@nseng-ai/pi-runtime" ? "*" : rewriteDependency(name, String(value), context),
		]),
	);
}
function rewriteDependency(name: string, specifier: string, context: PublicPackageContext): string {
	if (excludedPackages.has(name))
		throw new Error(`Publish manifest must not depend on excluded package ${name}`);
	if (specifier === "workspace:*") {
		const version = context.manifestByName.get(name)?.manifest.version;
		if (version === undefined || !intendedPublicPackages.includes(name))
			throw new Error(`${name} is not in the intended public package set`);
		return version;
	}
	return specifier === "catalog:" ? catalogVersion(context.workspaceYaml, name) : specifier;
}
function assertPublishManifest(manifest: Record<string, unknown>): void {
	if (manifest.private !== undefined)
		throw new Error(`${String(manifest.name)} publish manifest must not include private`);
	for (const blockName of [
		"dependencies",
		"optionalDependencies",
		"peerDependencies",
		"devDependencies",
	]) {
		const value = manifest[blockName];
		const block = isRecord(value) ? value : {};
		for (const [name, specifier] of Object.entries(block)) {
			if (
				excludedPackages.has(name) &&
				!(blockName === "peerDependencies" && name === "@nseng-ai/pi-runtime")
			)
				throw new Error(`${String(manifest.name)} ${blockName} leaks excluded package ${name}`);
			if (String(specifier).startsWith("workspace:"))
				throw new Error(`${String(manifest.name)} ${blockName}.${name} uses workspace:`);
			if (String(specifier).startsWith("catalog:"))
				throw new Error(`${String(manifest.name)} ${blockName}.${name} uses catalog:`);
		}
	}
}
function assertPublishOrder(): void {
	if (
		new Set(publicPublishOrder).size !== publicPublishOrder.length ||
		intendedPublicPackages.some((name) => !publicPublishOrder.includes(name))
	)
		throw new Error("Explicit publish order does not match intended public set");
}
function assertIntendedSet(manifests: ReadonlyMap<string, PublicPackageEntry>): void {
	for (const name of intendedPublicPackages) {
		const manifest = manifests.get(name)?.manifest;
		if (manifest === undefined) throw new Error(`Intended public package is missing: ${name}`);
		if (manifest.private === true)
			throw new Error(`Intended public package is still private: ${name}`);
	}
}
function assertSdkExports(manifests: ReadonlyMap<string, PublicPackageEntry>): void {
	const sdkExports = manifests.get("@nseng-ai/sdk")?.manifest.exports ?? {};
	const expected = sdkPublicExports();
	const nsExports = manifests.get("@nseng-ai/ns")?.manifest.exports ?? {};
	for (const entry of sdkFoldEntries) {
		if (sdkExports[entry.sourceExport] !== expected[entry.sourceExport])
			throw new Error(`@nseng-ai/sdk source manifest is missing ${entry.sourceExport}`);
		if (nsExports[entry.nsExport] !== `./src/sdk/${entry.name}.ts`)
			throw new Error(`@nseng-ai/ns source manifest is missing ${entry.nsExport}`);
	}
}
function decodePackageManifest(value: Record<string, unknown>, path: string): PackageManifest {
	if (typeof value.name !== "string")
		throw new Error(`Package manifest ${path} is missing a string name`);
	return { ...value, name: value.name };
}
async function collectManifestPaths(
	fs: FileSystemGateway,
	root: string,
	depth: number,
): Promise<string[]> {
	if (depth > MAX_PACKAGE_TREE_WALK_DEPTH) return [];
	const paths: string[] = [];
	for (const entry of await fs.readDir(root)) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const path = resolve(root, entry.name);
		if (entry.isFile && entry.name === "package.json") paths.push(path);
		else if (entry.isDirectory) paths.push(...(await collectManifestPaths(fs, path, depth + 1)));
	}
	return paths;
}
