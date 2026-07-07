import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

import { formatErrorMessage, isPathInside } from "@nseng-ai/foundation/primitives";
import { resultErr, resultOk, type Result } from "@nseng-ai/foundation/result";
import { requireXdgPath, resolveNsXdgPath } from "@nseng-ai/foundation/xdg-path";

import type { SkillHarnessArtifactEntry } from "./artifact-catalog.ts";
import type { OptionalTextFileState } from "./provision-apply.ts";
import { sortStrings } from "./sort.ts";
import {
	MODULE_ARTIFACT_DECLARATION_DIAGNOSTIC_CODES,
	parseModuleArtifactDeclaration,
	type ModuleArtifactDeclarationDiagnostic,
} from "./module-artifact-declaration.ts";

export interface DiscoverExtensionModuleHarnessArtifactsRequest {
	projectRoot: string;
	homeDir?: string;
	env?: Record<string, string | undefined>;
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

export interface HarnessArtifactModuleDiscoveryGateway {
	readDirectory(
		path: string,
	): Promise<Result<ModuleDiscoveryDirectoryState, ModuleArtifactDiscoveryFileSystemErrorInfo>>;
	readOptionalTextFile(
		path: string,
	): Promise<Result<ModuleDiscoveryTextFileState, ModuleArtifactDiscoveryFileSystemErrorInfo>>;
	pathState(
		path: string,
	): Promise<Result<ModuleDiscoveryPathState, ModuleArtifactDiscoveryFileSystemErrorInfo>>;
}

export interface ModuleDiscoveryDirectoryEntry {
	name: string;
	type: "directory" | "file" | "other";
}

export type ModuleDiscoveryDirectoryState =
	| { type: "missing" }
	| { type: "file" }
	| { type: "directory"; entries: readonly ModuleDiscoveryDirectoryEntry[] };

export type ModuleDiscoveryTextFileState = OptionalTextFileState;

export type ModuleDiscoveryPathState =
	| { type: "missing" }
	| { type: "file" }
	| { type: "directory" }
	| { type: "other" };

export interface ModuleArtifactDiscoveryFileSystemErrorInfo {
	code: "filesystem_error";
	message: string;
	details: { path: string; operation: "stat" | "list" | "read" };
}

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

export const nodeHarnessArtifactModuleDiscoveryGateway: HarnessArtifactModuleDiscoveryGateway = {
	async readDirectory(path) {
		try {
			const pathStat = await stat(path);
			if (pathStat.isFile()) return resultOk({ type: "file" });
			if (!pathStat.isDirectory()) return resultOk({ type: "file" });
			const entries = await readdir(path, { withFileTypes: true });
			return resultOk({
				type: "directory",
				entries: entries.map((entry) => ({
					name: entry.name,
					type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
				})),
			});
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "list", error));
		}
	},
	async readOptionalTextFile(path) {
		try {
			return resultOk({ type: "file", text: await readFile(path, "utf8") });
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "read", error));
		}
	},
	async pathState(path) {
		try {
			const pathStat = await stat(path);
			if (pathStat.isDirectory()) return resultOk({ type: "directory" });
			if (pathStat.isFile()) return resultOk({ type: "file" });
			return resultOk({ type: "other" });
		} catch (error) {
			if (isNodeErrorCode(error, "ENOENT")) return resultOk({ type: "missing" });
			return resultErr(fileSystemError(path, "stat", error));
		}
	},
};

export async function discoverExtensionModuleHarnessArtifacts(
	request: DiscoverExtensionModuleHarnessArtifactsRequest,
): Promise<DiscoverExtensionModuleHarnessArtifactsResult> {
	const gateway = request.gateway ?? nodeHarnessArtifactModuleDiscoveryGateway;
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
	const env = {
		...process.env,
		...(request.env ?? {}),
		...(request.homeDir === undefined ? {} : { HOME: request.homeDir }),
	};
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
				artifactDiagnostic(
					"module_artifact_skill_path_escapes",
					`Skill harness artifact path must remain inside its package: ${artifact.source.relativePath}.`,
					artifact.source.relativePath,
					artifact,
					options.packageName,
				),
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
				artifactDiagnostic(
					"module_artifact_skill_entry_missing",
					`Declared skill harness artifact must contain SKILL.md: ${artifact.source.relativePath}.`,
					join(artifact.source.relativePath, "SKILL.md"),
					artifact,
					options.packageName,
				),
			);
			continue;
		}
		if (state.value.type !== "file") {
			diagnostics.push(
				artifactDiagnostic(
					"module_artifact_skill_entry_not_directory",
					`Declared skill harness artifact SKILL.md path must be a file: ${artifact.source.relativePath}.`,
					join(artifact.source.relativePath, "SKILL.md"),
					artifact,
					options.packageName,
				),
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

function artifactDiagnostic(
	code: Extract<
		ModuleArtifactDiscoveryDiagnosticCode,
		| "module_artifact_skill_path_escapes"
		| "module_artifact_skill_entry_missing"
		| "module_artifact_skill_entry_not_directory"
	>,
	message: string,
	path: string,
	artifact: SkillHarnessArtifactEntry,
	packageName: string,
): ModuleArtifactDiscoveryDiagnostic {
	return {
		code,
		message,
		path,
		packageName,
		artifactId: artifact.id,
		artifactName: artifact.skillName,
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
	error: ModuleArtifactDiscoveryFileSystemErrorInfo,
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
	return [...diagnostics].sort((left, right) =>
		diagnosticSortKey(left).localeCompare(diagnosticSortKey(right)),
	);
}

function diagnosticSortKey(diagnostic: ModuleArtifactDiscoveryDiagnostic): string {
	return [
		diagnostic.path ?? "",
		diagnostic.packageName ?? "",
		diagnostic.artifactId ?? "",
		diagnostic.artifactName ?? "",
		diagnostic.code,
		diagnostic.message,
	].join("\0");
}

function fileSystemError(
	path: string,
	operation: ModuleArtifactDiscoveryFileSystemErrorInfo["details"]["operation"],
	error: unknown,
): ModuleArtifactDiscoveryFileSystemErrorInfo {
	return {
		code: "filesystem_error",
		message: `Filesystem ${operation} failed for ${path}: ${formatErrorMessage(error)}`,
		details: { path, operation },
	};
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
