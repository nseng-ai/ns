import { existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { BAN_SUBPACKAGE_DECLARATION_CONFORMANCE } from "./config.ts";
import { findTypeScriptSourceFiles } from "./file-discovery.ts";
import { type PackageMetadata } from "./package-metadata.ts";
import { type SourceRuleViolation } from "./source-rules.ts";
import { belongsToDeclaredSubpackage, formatDeclaredSubpackageUnits } from "./subpackage-paths.ts";

export interface SubpackageDeclarationConformanceOptions {
	readonly repoRoot: string;
	readonly packageMetadataByName: ReadonlyMap<string, PackageMetadata>;
}

export function collectSubpackageDeclarationConformanceViolations(
	options: SubpackageDeclarationConformanceOptions,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	for (const metadata of options.packageMetadataByName.values()) {
		if (!isDeclaringPackage(metadata)) continue;
		const sourceDir = join(options.repoRoot, metadata.packageDir, "src");
		violations.push(...collectMissingSubpackageDirectoryViolations(metadata, options.repoRoot));
		if (metadata.sdlRemainder) continue;
		if (!directoryExists(sourceDir)) continue;
		for (const sourceFile of findTypeScriptSourceFiles(sourceDir)) {
			const sourcePath = relative(sourceDir, sourceFile);
			if (belongsToDeclaredSubpackage(sourcePath, metadata.sdlSubpackages)) continue;
			violations.push(buildSourceFileViolation(metadata, options.repoRoot, sourceFile));
		}
	}
	return violations;
}

function isDeclaringPackage(metadata: PackageMetadata): boolean {
	return metadata.sdlSubpackages.length > 0 || metadata.sdlRemainder;
}

function collectMissingSubpackageDirectoryViolations(
	metadata: PackageMetadata,
	repoRoot: string,
): SourceRuleViolation[] {
	const sourceDir = join(repoRoot, metadata.packageDir, "src");
	return metadata.sdlSubpackages
		.filter((subpackage) => !directoryExists(join(sourceDir, subpackage)))
		.map((subpackage) => ({
			rule: BAN_SUBPACKAGE_DECLARATION_CONFORMANCE,
			path: metadata.packageJsonPath,
			line: 1,
			column: 1,
			text:
				`Package ${metadata.name} declares ji.subpackages entry "${subpackage}" but ` +
				`${relative(repoRoot, join(sourceDir, subpackage))} is not a directory.`,
		}));
}

function buildSourceFileViolation(
	metadata: PackageMetadata,
	repoRoot: string,
	sourceFile: string,
): SourceRuleViolation {
	const declaredUnits = formatDeclaredSubpackageUnits(metadata.sdlSubpackages);
	const sourcePath = relative(repoRoot, sourceFile);
	return {
		rule: BAN_SUBPACKAGE_DECLARATION_CONFORMANCE,
		path: sourcePath,
		line: 1,
		column: 1,
		text:
			`Package ${metadata.name} declares subpackages without ji.remainder, so ` +
			`${sourcePath} must live under a declared subpackage` +
			`${declaredUnits === "" ? "." : ` (${declaredUnits}).`}`,
	};
}

function directoryExists(path: string): boolean {
	return existsSync(path) && statSync(path).isDirectory();
}
