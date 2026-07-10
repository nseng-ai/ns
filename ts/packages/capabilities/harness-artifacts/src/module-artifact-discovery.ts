import { join, resolve } from "node:path";

import { isPathInside, optionalEntry } from "@nseng-ai/foundation/primitives";
import { type ExtensionDescriptor } from "@nseng-ai/kernel/sdk";
import { z } from "zod";

import type { SkillHarnessArtifactEntry } from "./artifact-catalog.ts";
import { sortDiagnosticsByKey } from "./diagnostic-sort.ts";
import {
	nodeHarnessArtifactFileSystemGateway,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactModuleDiscoveryGateway,
	type ModuleDiscoveryDirectoryEntry,
	type ModuleDiscoveryDirectoryState,
	type ModuleDiscoveryPathState,
} from "./filesystem.ts";
import {
	MODULE_ARTIFACT_DECLARATION_DIAGNOSTIC_CODES,
	parseModuleArtifactDeclarations,
	type ModuleArtifactDeclarationDiagnostic,
} from "./module-artifact-declaration.ts";

export interface DeclaredExtensionModuleArtifactFacts {
	readonly moduleRoot: string;
	readonly packageName: string;
	readonly version: string;
	readonly descriptor: ExtensionDescriptor;
}

export interface DiscoverDeclaredExtensionModuleHarnessArtifactsRequest {
	readonly modules: readonly DeclaredExtensionModuleArtifactFacts[];
	readonly gateway?: HarnessArtifactModuleDiscoveryGateway;
}

export interface ResolvedNpmModuleHarnessArtifactCatalog {
	type: "npm-module-catalog";
	moduleRoot: string;
	packageName: string;
	version: string;
	artifacts: readonly SkillHarnessArtifactEntry[];
	diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[];
}

export interface DiscoverExtensionModuleHarnessArtifactsResult {
	catalogs: readonly ResolvedNpmModuleHarnessArtifactCatalog[];
	diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[];
}

export type {
	HarnessArtifactFileSystemErrorInfo,
	HarnessArtifactModuleDiscoveryGateway,
	ModuleDiscoveryDirectoryEntry,
	ModuleDiscoveryDirectoryState,
	ModuleDiscoveryPathState,
};

export const MODULE_ARTIFACT_DISCOVERY_DIAGNOSTIC_CODES = [
	...MODULE_ARTIFACT_DECLARATION_DIAGNOSTIC_CODES,
	"module_artifact_extension_root_unreadable",
	"module_artifact_local_package_missing",
	"module_artifact_local_package_not_directory",
	"module_artifact_local_package_missing_package_json",
	"module_artifact_skill_path_escapes",
	"module_artifact_skill_entry_missing",
	"module_artifact_skill_entry_not_directory",
	"module_artifact_duplicate_id",
	"module_artifact_duplicate_target_name",
] as const;

export type ModuleArtifactDiscoveryDiagnosticCode =
	(typeof MODULE_ARTIFACT_DISCOVERY_DIAGNOSTIC_CODES)[number];

export interface ModuleArtifactDiscoveryDiagnostic {
	code: ModuleArtifactDiscoveryDiagnosticCode;
	message: string;
	path?: string;
	packageName?: string;
	artifactId?: string;
	artifactName?: string;
}

const moduleArtifactDiscoveryDiagnosticCodeSchema = z.enum(
	MODULE_ARTIFACT_DISCOVERY_DIAGNOSTIC_CODES,
);

export const moduleArtifactDiscoveryDiagnosticSchema: z.ZodType<ModuleArtifactDiscoveryDiagnostic> =
	z
		.object({
			code: moduleArtifactDiscoveryDiagnosticCodeSchema,
			message: z.string(),
			path: z.string().optional(),
			packageName: z.string().optional(),
			artifactId: z.string().optional(),
			artifactName: z.string().optional(),
		})
		.transform((diagnostic) => ({
			code: diagnostic.code,
			message: diagnostic.message,
			...optionalEntry("path", diagnostic.path),
			...optionalEntry("packageName", diagnostic.packageName),
			...optionalEntry("artifactId", diagnostic.artifactId),
			...optionalEntry("artifactName", diagnostic.artifactName),
		}));

/** Discover artifacts from already-loaded declared descriptors without widening the source set. */
export async function discoverDeclaredExtensionModuleHarnessArtifacts(
	request: DiscoverDeclaredExtensionModuleHarnessArtifactsRequest,
): Promise<DiscoverExtensionModuleHarnessArtifactsResult> {
	const gateway = request.gateway ?? nodeHarnessArtifactFileSystemGateway;
	const catalogs: ResolvedNpmModuleHarnessArtifactCatalog[] = [];
	for (const module of [...request.modules].sort((left, right) =>
		left.moduleRoot.localeCompare(right.moduleRoot),
	)) {
		const parsed = parseModuleArtifactDeclarations({
			packageName: module.packageName,
			version: module.version,
			declarations: descriptorArtifactDeclarations(module.descriptor),
		});
		catalogs.push(await validateAndAssembleCatalog(module, parsed, gateway));
	}
	return finalizeDiscoveryResult(catalogs);
}

async function validateAndAssembleCatalog(
	module: DeclaredExtensionModuleArtifactFacts,
	parsed: ReturnType<typeof parseModuleArtifactDeclarations>,
	gateway: HarnessArtifactModuleDiscoveryGateway,
): Promise<ResolvedNpmModuleHarnessArtifactCatalog> {
	const declarationDiagnostics = parsed.diagnostics.map((diagnostic) =>
		declarationDiagnostic(diagnostic, module.moduleRoot),
	);
	if (!parsed.ok) {
		return {
			type: "npm-module-catalog",
			moduleRoot: module.moduleRoot,
			packageName: module.packageName,
			version: module.version,
			artifacts: [],
			diagnostics: sortDiscoveryDiagnostics(declarationDiagnostics),
		};
	}
	const artifactResults = await validateDiscoveredArtifacts({
		moduleRoot: module.moduleRoot,
		packageName: module.packageName,
		artifacts: parsed.artifacts,
		gateway,
	});
	return {
		type: "npm-module-catalog",
		moduleRoot: module.moduleRoot,
		packageName: parsed.packageName,
		version: parsed.version,
		artifacts: artifactResults.artifacts,
		diagnostics: sortDiscoveryDiagnostics([
			...declarationDiagnostics,
			...artifactResults.diagnostics,
		]),
	};
}

function finalizeDiscoveryResult(
	catalogs: readonly ResolvedNpmModuleHarnessArtifactCatalog[],
	extraDiagnostics: readonly ModuleArtifactDiscoveryDiagnostic[] = [],
): DiscoverExtensionModuleHarnessArtifactsResult {
	const duplicateDiagnostics = duplicateArtifactDiagnostics(catalogs);
	const finalizedCatalogs = catalogs.map((catalog) => ({
		...catalog,
		diagnostics: sortDiscoveryDiagnostics([
			...catalog.diagnostics,
			...duplicateDiagnostics.filter((diagnostic) => diagnostic.path === catalog.moduleRoot),
		]),
	}));
	return {
		catalogs: finalizedCatalogs,
		diagnostics: sortDiscoveryDiagnostics([
			...extraDiagnostics,
			...finalizedCatalogs.flatMap((catalog) => catalog.diagnostics),
		]),
	};
}

function descriptorArtifactDeclarations(descriptor: ExtensionDescriptor): readonly unknown[] {
	return descriptor.bundledArtifacts ?? [];
}

async function validateDiscoveredArtifacts(options: {
	moduleRoot: string;
	packageName: string;
	artifacts: readonly SkillHarnessArtifactEntry[];
	gateway: HarnessArtifactModuleDiscoveryGateway;
}): Promise<{
	artifacts: readonly SkillHarnessArtifactEntry[];
	diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[];
}> {
	const artifacts: SkillHarnessArtifactEntry[] = [];
	const diagnostics: ModuleArtifactDiscoveryDiagnostic[] = [];
	for (const artifact of options.artifacts) {
		const artifactRoot = resolve(options.moduleRoot, artifact.source.relativePath);
		if (!isPathInside(options.moduleRoot, artifactRoot)) {
			diagnostics.push(
				artifactDiagnostic({
					code: "module_artifact_skill_path_escapes",
					message: `Skill harness artifact path must remain inside its package: ${artifact.source.relativePath}.`,
					path: artifact.source.relativePath,
					artifact,
					packageName: options.packageName,
				}),
			);
			continue;
		}
		const state = await options.gateway.pathState(join(artifactRoot, "SKILL.md"));
		if (!state.ok) {
			diagnostics.push(discoveryFileSystemDiagnostic(state.error, artifact));
			continue;
		}
		if (state.value.type === "missing") {
			diagnostics.push(
				artifactDiagnostic({
					code: "module_artifact_skill_entry_missing",
					message: `Declared skill harness artifact must contain SKILL.md: ${artifact.source.relativePath}.`,
					path: join(artifact.source.relativePath, "SKILL.md"),
					artifact,
					packageName: options.packageName,
				}),
			);
			continue;
		}
		if (state.value.type !== "file") {
			diagnostics.push(
				artifactDiagnostic({
					code: "module_artifact_skill_entry_not_directory",
					message: `Declared skill harness artifact SKILL.md path must be a file: ${artifact.source.relativePath}.`,
					path: join(artifact.source.relativePath, "SKILL.md"),
					artifact,
					packageName: options.packageName,
				}),
			);
			continue;
		}
		artifacts.push(artifact);
	}
	return {
		artifacts: artifacts.sort((left, right) => left.id.localeCompare(right.id)),
		diagnostics: sortDiscoveryDiagnostics(diagnostics),
	};
}

interface ArtifactDiagnosticOptions {
	code: Extract<
		ModuleArtifactDiscoveryDiagnosticCode,
		| "module_artifact_skill_path_escapes"
		| "module_artifact_skill_entry_missing"
		| "module_artifact_skill_entry_not_directory"
	>;
	message: string;
	path: string;
	artifact: SkillHarnessArtifactEntry;
	packageName: string;
}

function artifactDiagnostic(options: ArtifactDiagnosticOptions): ModuleArtifactDiscoveryDiagnostic {
	return {
		code: options.code,
		message: options.message,
		path: options.path,
		packageName: options.packageName,
		artifactId: options.artifact.id,
		artifactName: options.artifact.skillName,
	};
}

function duplicateArtifactDiagnostics(
	catalogs: readonly ResolvedNpmModuleHarnessArtifactCatalog[],
): readonly ModuleArtifactDiscoveryDiagnostic[] {
	const artifacts = catalogs.flatMap((catalog) =>
		catalog.artifacts.map((artifact) => ({ catalog, artifact })),
	);
	return [
		...duplicateDiagnosticsForKey(
			artifacts,
			(item) => item.artifact.id,
			"module_artifact_duplicate_id",
		),
		...duplicateDiagnosticsForKey(
			artifacts,
			(item) => item.artifact.skillName,
			"module_artifact_duplicate_target_name",
		),
	];
}

function duplicateDiagnosticsForKey(
	items: readonly {
		catalog: ResolvedNpmModuleHarnessArtifactCatalog;
		artifact: SkillHarnessArtifactEntry;
	}[],
	keyForItem: (item: {
		catalog: ResolvedNpmModuleHarnessArtifactCatalog;
		artifact: SkillHarnessArtifactEntry;
	}) => string,
	code: Extract<
		ModuleArtifactDiscoveryDiagnosticCode,
		"module_artifact_duplicate_id" | "module_artifact_duplicate_target_name"
	>,
): readonly ModuleArtifactDiscoveryDiagnostic[] {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(keyForItem(item), (counts.get(keyForItem(item)) ?? 0) + 1);
	const diagnostics: ModuleArtifactDiscoveryDiagnostic[] = [];
	for (const item of items) {
		const key = keyForItem(item);
		if ((counts.get(key) ?? 0) < 2) continue;
		diagnostics.push({
			code,
			message:
				code === "module_artifact_duplicate_id"
					? `Duplicate harness artifact id discovered: ${key}.`
					: `Duplicate target skill name discovered: ${key}.`,
			path: item.catalog.moduleRoot,
			packageName: item.catalog.packageName,
			artifactId: item.artifact.id,
			artifactName: item.artifact.skillName,
		});
	}
	return diagnostics;
}

function declarationDiagnostic(
	diagnostic: ModuleArtifactDeclarationDiagnostic,
	packageJsonPath: string,
): ModuleArtifactDiscoveryDiagnostic {
	return {
		...diagnostic,
		path: diagnostic.path ?? packageJsonPath,
	};
}

function discoveryFileSystemDiagnostic(
	error: HarnessArtifactFileSystemErrorInfo,
	artifact?: SkillHarnessArtifactEntry,
): ModuleArtifactDiscoveryDiagnostic {
	return {
		code: "module_artifact_extension_root_unreadable",
		message: error.message,
		path: error.details.path,
		...(artifact === undefined
			? {}
			: {
					packageName: artifact.source.packageName,
					artifactId: artifact.id,
					artifactName: artifact.skillName,
				}),
	};
}

function sortDiscoveryDiagnostics(
	diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[],
): readonly ModuleArtifactDiscoveryDiagnostic[] {
	return sortDiagnosticsByKey(diagnostics, (diagnostic) => [
		diagnostic.path,
		diagnostic.packageName,
		diagnostic.artifactId,
		diagnostic.artifactName,
		diagnostic.code,
		diagnostic.message,
	]);
}
