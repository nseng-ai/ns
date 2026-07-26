import { dirname, isAbsolute, relative, resolve } from "node:path";
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

/**
 * The `public/` release-disposition root (ADR 0045). Release-candidate membership is derived from
 * this directory alone; there is deliberately no hand-maintained intended-public list to drift.
 */
export const publicDispositionRoot = resolve(workspaceRoot, "packages", "public");

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
	/** Release candidates derived from `public/`, in dependency-safe publish order. */
	readonly releaseInventory: readonly string[];
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
	const releaseInventory = deriveReleaseInventory(packageManifests);
	assertReleaseInventory(releaseInventory, manifestByName);
	assertSdkExports(manifestByName);
	return {
		workspaceManifest,
		workspaceYaml,
		packageManifests,
		manifestByName,
		releaseInventory,
	};
}

/**
 * The release-candidate qualification rule: a workspace manifest that lives under the `public/`
 * disposition root and is not `private: true`. Membership follows the tree, so moving a package
 * into `public/` makes it a candidate with no second edit anywhere, and nothing outside `public/`
 * can ever become one.
 */
export function isReleaseCandidate(entry: PublicPackageEntry): boolean {
	if (entry.manifest.private === true) return false;
	const relativeRoot = relative(publicDispositionRoot, entry.root);
	return relativeRoot.length > 0 && !relativeRoot.startsWith("..") && !isAbsolute(relativeRoot);
}

/**
 * Derives the ordered release inventory. Order is a genuine constraint — Clinkr and Foundation
 * must precede their dependents — so it is computed topologically from the candidates' own
 * workspace dependency edges rather than restated as a second list that could drift from
 * membership. Ties break alphabetically to keep the order a deterministic function of the tree.
 */
export function deriveReleaseInventory(entries: readonly PublicPackageEntry[]): readonly string[] {
	const candidates = entries.filter(isReleaseCandidate);
	const candidateNames = new Set(candidates.map((entry) => entry.manifest.name));
	if (candidateNames.size !== candidates.length) {
		throw new Error(`Release candidates under ${publicDispositionRoot} share a package name`);
	}
	const edges = new Map(
		candidates.map((entry) => [entry.manifest.name, candidateDependencies(entry, candidateNames)]),
	);
	const remaining = new Set(candidateNames);
	const ordered: string[] = [];
	while (remaining.size > 0) {
		const next = [...remaining]
			.filter((name) => (edges.get(name) ?? []).every((dependency) => !remaining.has(dependency)))
			.sort()[0];
		if (next === undefined) {
			throw new Error(
				`Release candidate dependencies are cyclic among: ${[...remaining].sort().join(", ")}`,
			);
		}
		ordered.push(next);
		remaining.delete(next);
	}
	return ordered;
}

function candidateDependencies(
	entry: PublicPackageEntry,
	candidateNames: ReadonlySet<string>,
): readonly string[] {
	const names = new Set<string>();
	for (const block of [
		entry.manifest.dependencies,
		entry.manifest.optionalDependencies,
		entry.manifest.peerDependencies,
	]) {
		for (const name of Object.keys(block ?? {})) {
			if (name !== entry.manifest.name && candidateNames.has(name)) names.add(name);
		}
	}
	return [...names];
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
	const mismatches = context.releaseInventory.flatMap((name) =>
		context.manifestByName.get(name)?.manifest.version === version
			? []
			: [`${name}: ${context.manifestByName.get(name)?.manifest.version ?? "<missing>"}`],
	);
	if (mismatches.length > 0)
		throw new Error(
			`Release candidate versions do not all match ${version}:\n- ${mismatches.join("\n- ")}`,
		);
}
export function buildPublishPlan(
	context: PublicPackageContext,
	version: string,
): PublishPlanEntry[] {
	assertCoordinatedVersion(context, version);
	return context.releaseInventory.map((packageName) => {
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
	assertPublishManifest(manifest, context);
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
			// A peer edge on a private workspace package is host-provided, never registry-resolved.
			context.manifestByName.get(name)?.manifest.private === true
				? "*"
				: rewriteDependency(name, String(value), context),
		]),
	);
}
function rewriteDependency(name: string, specifier: string, context: PublicPackageContext): string {
	const entry = context.manifestByName.get(name);
	if (entry?.manifest.private === true)
		throw new Error(`Publish manifest must not depend on private workspace package ${name}`);
	if (specifier === "workspace:*") {
		const version = entry?.manifest.version;
		if (version === undefined)
			throw new Error(`${name} has no workspace version to publish a dependency against`);
		return version;
	}
	return specifier === "catalog:" ? catalogVersion(context.workspaceYaml, name) : specifier;
}
function assertPublishManifest(
	manifest: Record<string, unknown>,
	context: PublicPackageContext,
): void {
	if (manifest.private !== undefined)
		throw new Error(`${String(manifest.name)} publish manifest must not include private`);
	const candidates = new Set(context.releaseInventory);
	for (const blockName of [
		"dependencies",
		"optionalDependencies",
		"peerDependencies",
		"devDependencies",
	]) {
		const value = manifest[blockName];
		const block = isRecord(value) ? value : {};
		for (const [name, specifier] of Object.entries(block)) {
			// Disposition closure, derived rather than listed: a released package may only carry
			// workspace edges onto other release candidates. The one exception is a host-provided
			// peer, which is published as an unconstrained `*` and resolved by the host.
			if (
				context.manifestByName.has(name) &&
				!candidates.has(name) &&
				!(blockName === "peerDependencies" && String(specifier) === "*")
			)
				throw new Error(
					`${String(manifest.name)} ${blockName} leaks non-public workspace package ${name}`,
				);
			if (String(specifier).startsWith("workspace:"))
				throw new Error(`${String(manifest.name)} ${blockName}.${name} uses workspace:`);
			if (String(specifier).startsWith("catalog:"))
				throw new Error(`${String(manifest.name)} ${blockName}.${name} uses catalog:`);
		}
	}
}
function assertReleaseInventory(
	inventory: readonly string[],
	manifests: ReadonlyMap<string, PublicPackageEntry>,
): void {
	if (inventory.length === 0)
		throw new Error(`No release candidates were found under ${publicDispositionRoot}`);
	for (const name of inventory) {
		const manifest = manifests.get(name)?.manifest;
		if (manifest === undefined) throw new Error(`Release candidate is missing: ${name}`);
		if (typeof manifest.version !== "string")
			throw new Error(`Release candidate has no version: ${name}`);
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
