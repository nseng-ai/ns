import { BAN_EXPORTS_SUBPACKAGE_CONFORMANCE } from "./config.ts";
import { type PackageMetadata } from "./package-metadata.ts";
import { type SourceRuleViolation } from "./source-rules.ts";

export interface ExportsSubpackageConformanceOptions {
	readonly packageMetadataByName: ReadonlyMap<string, PackageMetadata>;
}

const SRC_TARGET_PREFIX = "./src/";

export function collectExportsSubpackageConformanceViolations(
	options: ExportsSubpackageConformanceOptions,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	for (const metadata of options.packageMetadataByName.values()) {
		if (metadata.sdlSubpackages.length === 0) continue;
		if (metadata.sdlRemainder) continue;
		for (const exportTarget of collectExportTargets(metadata.manifest.exports)) {
			if (!exportTarget.target.startsWith(SRC_TARGET_PREFIX)) continue;
			const pathWithinSrc = exportTarget.target.slice(SRC_TARGET_PREFIX.length);
			if (belongsToDeclaredSubpackage(pathWithinSrc, metadata.sdlSubpackages)) continue;
			violations.push(buildExportTargetViolation(metadata, exportTarget));
		}
	}
	return violations;
}

interface ExportTarget {
	readonly subpath: string;
	readonly target: string;
}

function collectExportTargets(exportsField: unknown): ExportTarget[] {
	if (!isRecord(exportsField)) return [];
	const targets: ExportTarget[] = [];
	for (const [subpath, value] of Object.entries(exportsField)) {
		for (const target of collectStringLeaves(value)) targets.push({ subpath, target });
	}
	return targets;
}

function collectStringLeaves(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (!isRecord(value)) return [];
	return Object.values(value).flatMap(collectStringLeaves);
}

function belongsToDeclaredSubpackage(
	pathWithinSrc: string,
	subpackages: readonly string[],
): boolean {
	return subpackages.some(
		(subpackage) => pathWithinSrc === subpackage || pathWithinSrc.startsWith(`${subpackage}/`),
	);
}

function buildExportTargetViolation(
	metadata: PackageMetadata,
	exportTarget: ExportTarget,
): SourceRuleViolation {
	const declaredUnits = metadata.sdlSubpackages
		.map((subpackage) => `src/${subpackage}/`)
		.join(", ");
	return {
		rule: BAN_EXPORTS_SUBPACKAGE_CONFORMANCE,
		path: metadata.packageJsonPath,
		line: 1,
		column: 1,
		text:
			`Package ${metadata.name} exports "${exportTarget.subpath}" -> ${exportTarget.target}, ` +
			`which does not resolve inside a declared subpackage (${declaredUnits}). Either root ` +
			`the target under a declared subpackage or declare its subpackage in sdl.subpackages.`,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
