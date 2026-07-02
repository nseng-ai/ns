import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { packageTierSet, type PackageTier } from "./config.ts";
import { findPackageJsonFiles } from "./file-discovery.ts";

export interface PackageManifest {
	readonly name: string;
	readonly exports?: unknown;
	readonly dependencies?: unknown;
	readonly optionalDependencies?: unknown;
	readonly peerDependencies?: unknown;
	readonly devDependencies?: unknown;
	readonly sdl?: unknown;
	readonly [key: string]: unknown;
}

export interface PackageMetadata {
	readonly name: string;
	readonly packageDir: string;
	readonly packageJsonPath: string;
	manifest: PackageManifest;
	manifestContent: string;
	readonly sdlTier: PackageTier | undefined;
	readonly rawSdlTier: unknown;
	readonly sdlSubpackages: readonly string[];
	readonly sdlRemainder: boolean;
	readonly exportSubpaths: ReadonlySet<string>;
}

export function loadPackageMetadata(repoRoot: string): Map<string, PackageMetadata> {
	const metadataByName = new Map<string, PackageMetadata>();
	for (const packageJsonPath of findPackageJsonFiles(join(repoRoot, "ts", "packages"))) {
		const packageDir = packageJsonPath.slice(0, -"/package.json".length);
		const manifestContent = readFileSync(packageJsonPath, "utf8");
		const parsed: unknown = JSON.parse(manifestContent);
		if (!isPackageManifest(parsed)) continue;
		const rawSdlTier = readRawSdlTier(parsed.sdl);
		metadataByName.set(parsed.name, {
			name: parsed.name,
			packageDir: relative(repoRoot, packageDir),
			packageJsonPath: relative(repoRoot, packageJsonPath),
			manifest: parsed,
			manifestContent,
			sdlTier: parsePackageTier(rawSdlTier),
			rawSdlTier,
			sdlSubpackages: readSdlSubpackages(parsed.sdl),
			sdlRemainder: readSdlRemainder(parsed.sdl),
			exportSubpaths: collectExportSubpaths(parsed.exports),
		});
	}
	return metadataByName;
}

export function readRawSdlTier(sdlField: unknown): unknown {
	if (!isRecord(sdlField)) return undefined;
	return sdlField.tier;
}

export function readSdlSubpackages(sdlField: unknown): readonly string[] {
	if (!isRecord(sdlField)) return [];
	const value = sdlField.subpackages;
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

export function readSdlRemainder(sdlField: unknown): boolean {
	if (!isRecord(sdlField)) return false;
	return sdlField.remainder === true;
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
	if (specifier === "sdl-flow" || specifier.startsWith("sdl-flow/")) return "sdl-flow";
	if (!specifier.startsWith("@sdl/")) return undefined;
	const parts = specifier.split("/");
	const scope = parts[0];
	const name = parts[1];
	if (scope === undefined || name === undefined) return undefined;
	return `${scope}/${name}`;
}

export function packageSubpathForSpecifier(specifier: string, packageName: string): string {
	if (specifier === packageName) return ".";
	return `.${specifier.slice(packageName.length)}`;
}

function isPackageManifest(value: unknown): value is PackageManifest {
	return isRecord(value) && typeof value.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
