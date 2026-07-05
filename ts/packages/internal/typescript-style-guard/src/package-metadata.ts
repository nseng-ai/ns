import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { packageTierSet, type PackageTier } from "./config.ts";
import { findPackageJsonFiles } from "./file-discovery.ts";

export interface PackageManifest {
	readonly name: string;
	readonly private?: unknown;
	readonly exports?: unknown;
	readonly dependencies?: unknown;
	readonly optionalDependencies?: unknown;
	readonly peerDependencies?: unknown;
	readonly peerDependenciesMeta?: unknown;
	readonly devDependencies?: unknown;
	readonly ns?: unknown;
	readonly [key: string]: unknown;
}

export interface PackageMetadata {
	readonly name: string;
	readonly packageDir: string;
	readonly packageJsonPath: string;
	manifest: PackageManifest;
	manifestContent: string;
	readonly nsTier: PackageTier | undefined;
	readonly rawNsTier: unknown;
	readonly nsSubpackages: readonly string[];
	readonly nsRemainder: boolean;
	readonly nsSubpackageTiers: ReadonlyMap<string, PackageTier>;
	readonly exportSubpaths: ReadonlySet<string>;
}

export function loadPackageMetadata(repoRoot: string): Map<string, PackageMetadata> {
	const metadataByName = new Map<string, PackageMetadata>();
	for (const packageJsonPath of findPackageJsonFiles(join(repoRoot, "ts", "packages"))) {
		const packageDir = packageJsonPath.slice(0, -"/package.json".length);
		const manifestContent = readFileSync(packageJsonPath, "utf8");
		const parsed: unknown = JSON.parse(manifestContent);
		if (!isPackageManifest(parsed)) continue;
		const rawNsTier = readRawNsTier(parsed.ns);
		metadataByName.set(parsed.name, {
			name: parsed.name,
			packageDir: relative(repoRoot, packageDir),
			packageJsonPath: relative(repoRoot, packageJsonPath),
			manifest: parsed,
			manifestContent,
			nsTier: parsePackageTier(rawNsTier),
			rawNsTier,
			nsSubpackages: readNsSubpackages(parsed.ns),
			nsRemainder: readNsRemainder(parsed.ns),
			nsSubpackageTiers: readNsSubpackageTiers(parsed.ns),
			exportSubpaths: collectExportSubpaths(parsed.exports),
		});
	}
	return metadataByName;
}

export function readRawNsTier(nsField: unknown): unknown {
	if (!isRecord(nsField)) return undefined;
	return nsField.tier;
}

export function readNsSubpackages(nsField: unknown): readonly string[] {
	if (!isRecord(nsField)) return [];
	const value = nsField.subpackages;
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

export function readNsRemainder(nsField: unknown): boolean {
	if (!isRecord(nsField)) return false;
	return nsField.remainder === true;
}

export function readNsSubpackageTiers(nsField: unknown): ReadonlyMap<string, PackageTier> {
	if (!isRecord(nsField)) return new Map();
	if (!isRecord(nsField.subpackageTiers)) return new Map();
	const tiers = new Map<string, PackageTier>();
	for (const [subpackage, rawTier] of Object.entries(nsField.subpackageTiers)) {
		const tier = parsePackageTier(rawTier);
		if (tier !== undefined) tiers.set(subpackage, tier);
	}
	return tiers;
}

export function parsePackageTier(value: unknown): PackageTier | undefined {
	if (typeof value !== "string") return undefined;
	return packageTierSet.has(value) ? (value as PackageTier) : undefined;
}

export function collectExportSubpaths(exportsField: unknown): Set<string> {
	if (exportsField === undefined) return new Set(["."]);
	if (typeof exportsField === "string") return new Set(["."]);
	if (!isRecord(exportsField)) return new Set();
	return new Set(Object.keys(exportsField));
}

export function packageNameForPath(
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): string | undefined {
	for (const metadata of packageMetadataByName.values()) {
		if (path === metadata.packageJsonPath) return metadata.name;
		if (path.startsWith(`${metadata.packageDir}/`)) return metadata.name;
	}
	return undefined;
}

export function packageNameForSpecifier(specifier: string): string | undefined {
	const [scope, name] = specifier.split("/");
	if (scope === undefined || name === undefined) return undefined;
	if (scope !== "@nseng-ai" && scope !== "@internal") return undefined;
	return `${scope}/${name}`;
}

export function packageSubpathForSpecifier(specifier: string, packageName: string): string {
	if (specifier === packageName) return ".";
	return `.${specifier.slice(packageName.length)}`;
}

function isPackageManifest(value: unknown): value is PackageManifest {
	return isRecord(value) && typeof value.name === "string";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
