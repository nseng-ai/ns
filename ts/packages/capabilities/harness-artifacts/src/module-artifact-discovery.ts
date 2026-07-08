import { join, resolve } from "node:path";
import process from "node:process";

import { formatErrorMessage, isPathInside, optionalEntry } from "@nseng-ai/foundation/primitives";
import { mergeXdgHomeEnv, requireXdgPath, resolveNsXdgPath } from "@nseng-ai/foundation/xdg-path";
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
import { sortStrings } from "./sort.ts";
import {
	MODULE_ARTIFACT_DECLARATION_DIAGNOSTIC_CODES,
	parseModuleArtifactDeclaration,
	type ModuleArtifactDeclarationDiagnostic,
} from "./module-artifact-declaration.ts";

export interface DiscoverExtensionModuleHarnessArtifactsRequest {
	projectRoot: string;
	/**
	 * Required-present so callers deliberately choose whether to override HOME for XDG lookup.
	 * Undefined means no explicit override; inherited/caller HOME is preserved.
	 */
	homeDir: string | undefined;
	/** Required-present so callers deliberately choose the environment used for XDG lookup. */
	env: Record<string, string | undefined>;
	gateway?: HarnessArtifactModuleDiscoveryGateway;
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
	"module_artifact_extension_root_unavailable",
	"module_artifact_extension_root_not_directory",
	"module_artifact_extension_root_unreadable",
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

const moduleArtifactDiscoveryDiagnosticOptionalFieldSchemas = {
	path: z.string().optional(),
	packageName: z.string().optional(),
	artifactId: z.string().optional(),
	artifactName: z.string().optional(),
};

const moduleArtifactDiscoveryDiagnosticSchemaBase = z.object({
	code: moduleArtifactDiscoveryDiagnosticCodeSchema,
	message: z.string(),
	...moduleArtifactDiscoveryDiagnosticOptionalFieldSchemas,
});

export const moduleArtifactDiscoveryDiagnosticSchema: z.ZodType<ModuleArtifactDiscoveryDiagnostic> =
	moduleArtifactDiscoveryDiagnosticSchemaBase.transform(normalizeModuleArtifactDiscoveryDiagnostic);

function normalizeModuleArtifactDiscoveryDiagnostic(
	diagnostic: z.output<typeof moduleArtifactDiscoveryDiagnosticSchemaBase>,
): ModuleArtifactDiscoveryDiagnostic {
	return {
		code: diagnostic.code,
		message: diagnostic.message,
		...optionalEntry("path", diagnostic.path),
		...optionalEntry("packageName", diagnostic.packageName),
		...optionalEntry("artifactId", diagnostic.artifactId),
		...optionalEntry("artifactName", diagnostic.artifactName),
	};
}

export async function discoverExtensionModuleHarnessArtifacts(
	request: DiscoverExtensionModuleHarnessArtifactsRequest,
): Promise<DiscoverExtensionModuleHarnessArtifactsResult> {
	const gateway = request.gateway ?? nodeHarnessArtifactFileSystemGateway;
	const rootResolution = extensionArtifactRoots(request);
	const catalogs: ResolvedNpmModuleHarnessArtifactCatalog[] = [];
	const diagnostics: ModuleArtifactDiscoveryDiagnostic[] = [...rootResolution.diagnostics];
	for (const root of rootResolution.roots) {
		const rootResult = await discoverExtensionRoot({ root, gateway });
		catalogs.push(...rootResult.catalogs);
		diagnostics.push(...rootResult.diagnostics);
	}
	const duplicateDiagnostics = duplicateArtifactDiagnostics(catalogs);
	const catalogsWithDuplicateDiagnostics = catalogs.map((catalog) => ({
		...catalog,
		diagnostics: sortDiscoveryDiagnostics([
			...catalog.diagnostics,
			...duplicateDiagnostics.filter((diagnostic) => diagnostic.path === catalog.moduleRoot),
		]),
	}));
	return {
		catalogs: catalogsWithDuplicateDiagnostics,
		diagnostics: sortDiscoveryDiagnostics([
			...diagnostics,
			...catalogsWithDuplicateDiagnostics.flatMap((catalog) => catalog.diagnostics),
		]),
	};
}

function extensionArtifactRoots(request: DiscoverExtensionModuleHarnessArtifactsRequest): {
	roots: readonly string[];
	diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[];
} {
	const env = mergeXdgHomeEnv({
		baseEnv: process.env,
		env: request.env,
		...optionalEntry("xdgHomeDir", request.homeDir),
	});
	const diagnostics: ModuleArtifactDiscoveryDiagnostic[] = [];
	const roots = [join(request.projectRoot, ".ns", "extensions")];
	try {
		roots.push(requireXdgPath(resolveNsXdgPath({ kind: "data", env, segments: ["extensions"] })));
	} catch (error) {
		diagnostics.push({
			code: "module_artifact_extension_root_unavailable",
			message: `Could not resolve global extension root for harness artifact discovery: ${formatErrorMessage(error)}`,
		});
	}
	return { roots: sortStrings(roots), diagnostics };
}

async function discoverExtensionRoot(options: {
	root: string;
	gateway: HarnessArtifactModuleDiscoveryGateway;
}): Promise<DiscoverExtensionModuleHarnessArtifactsResult> {
	const root = await options.gateway.readDirectory(options.root);
	if (!root.ok) {
		return {
			catalogs: [],
			diagnostics: [discoveryFileSystemDiagnostic(root.error)],
		};
	}
	if (root.value.type === "missing") return { catalogs: [], diagnostics: [] };
	if (root.value.type !== "directory") {
		return {
			catalogs: [],
			diagnostics: [
				{
					code: "module_artifact_extension_root_not_directory",
					message: `Extension root must be a directory for harness artifact discovery: ${options.root}.`,
					path: options.root,
				},
			],
		};
	}
	const catalogs: ResolvedNpmModuleHarnessArtifactCatalog[] = [];
	const diagnostics: ModuleArtifactDiscoveryDiagnostic[] = [];
	for (const entry of [...root.value.entries].sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		if (entry.type !== "directory") continue;
		const moduleRoot = join(options.root, entry.name);
		const packageCatalog = await discoverExtensionPackage({ moduleRoot, gateway: options.gateway });
		if (packageCatalog.type === "catalog") catalogs.push(packageCatalog.catalog);
		else diagnostics.push(...packageCatalog.diagnostics);
	}
	return { catalogs, diagnostics: sortDiscoveryDiagnostics(diagnostics) };
}

async function discoverExtensionPackage(options: {
	moduleRoot: string;
	gateway: HarnessArtifactModuleDiscoveryGateway;
}): Promise<
	| { type: "catalog"; catalog: ResolvedNpmModuleHarnessArtifactCatalog }
	| { type: "diagnostics"; diagnostics: readonly ModuleArtifactDiscoveryDiagnostic[] }
> {
	const packageJsonPath = join(options.moduleRoot, "package.json");
	const packageText = await options.gateway.readOptionalTextFile(packageJsonPath);
	if (!packageText.ok) {
		return { type: "diagnostics", diagnostics: [discoveryFileSystemDiagnostic(packageText.error)] };
	}
	if (packageText.value.type === "missing") return { type: "diagnostics", diagnostics: [] };
	const parsed = parseModuleArtifactDeclaration(packageText.value.text);
	if (!parsed.ok) {
		return {
			type: "diagnostics",
			diagnostics: parsed.diagnostics.map((diagnostic) =>
				declarationDiagnostic(diagnostic, packageJsonPath),
			),
		};
	}
	const artifactResults = await validateDiscoveredArtifacts({
		moduleRoot: options.moduleRoot,
		packageName: parsed.packageName,
		artifacts: parsed.artifacts,
		gateway: options.gateway,
	});
	return {
		type: "catalog",
		catalog: {
			type: "npm-module-catalog",
			moduleRoot: options.moduleRoot,
			packageName: parsed.packageName,
			version: parsed.version,
			artifacts: artifactResults.artifacts,
			diagnostics: sortDiscoveryDiagnostics([
				...parsed.diagnostics.map((diagnostic) =>
					declarationDiagnostic(diagnostic, packageJsonPath),
				),
				...artifactResults.diagnostics,
			]),
		},
	};
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
