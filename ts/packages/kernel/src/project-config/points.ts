import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { formatErrorMessage, isPathInside } from "@nseng-ai/foundation/primitives";
import { parse } from "smol-toml";
import { z, type ZodType } from "zod";

import { scanExtensionRoot } from "../runtime/extension-root-discovery.ts";
import { NS_COMMAND_NAME_PATTERN } from "../sdk/command-name.ts";
import {
	nsExtensionManifestPointSchema,
	nsExtensionPackageManifestSchema,
	nsExtensionPointAcceptsValues,
	nsExtensionPointSemanticsValues,
} from "../sdk/extension-manifest.ts";

export type PointAccepts = (typeof nsExtensionPointAcceptsValues)[number];
export type PointSemantics = (typeof nsExtensionPointSemanticsValues)[number];

export interface PointDefinition {
	id: string;
	accepts: PointAccepts;
	semantics: PointSemantics;
	description?: string;
	defaultPath?: string;
	manifestPath?: string;
}

export interface SettingsSchema<T = unknown> {
	path: readonly [string, ...string[]];
	schema: ZodType<T>;
	invalidMessage?: (context: { pathLabel: string; key: string }) => string;
}

export interface ProjectConfigGateway {
	readTextFile: (request: { repoRoot: string; relativePath: string }) => ProjectConfigReadResult;
	pathExists?: (request: {
		repoRoot: string;
		relativePath: string;
	}) => ProjectConfigPathExistsResult;
}

export type ProjectConfigReadResult =
	| { type: "found"; text: string }
	| { type: "missing" }
	| { type: "error"; message: string };

export type ProjectConfigPathExistsResult =
	| { type: "present" }
	| { type: "missing" }
	| { type: "error"; message: string };

export interface ProjectConfigDiagnostic {
	severity: "error" | "info";
	code: string;
	message: string;
	path?: string;
}

export type ProjectPointInstallation =
	| { pointId: string; accepts: "hook"; commands: readonly string[] }
	| { pointId: string; accepts: "prompt"; path: string };

export interface LoadedProjectConfig {
	points: readonly ProjectPointInstallation[];
	settings: ReadonlyMap<string, unknown>;
}

export function getProjectConfigSetting<T>(
	config: LoadedProjectConfig,
	schema: SettingsSchema<T>,
): T | undefined {
	return config.settings.get(schema.path.join(".")) as T | undefined;
}

export type LoadProjectConfigResult =
	| { ok: true; config: LoadedProjectConfig; diagnostics: readonly ProjectConfigDiagnostic[] }
	| { ok: false; diagnostics: readonly ProjectConfigDiagnostic[]; config?: LoadedProjectConfig };

export interface PointDefinitionDiscoveryResult {
	pointDefinitions: readonly PointDefinition[];
	diagnostics: readonly ProjectConfigDiagnostic[];
}

export type PointCatalogInstallation =
	| { source: "env-prompt"; pointId: string; envVar: string; path: string }
	| { source: "ns.toml"; installation: ProjectPointInstallation }
	| { source: "conventional-prompt"; pointId: string; path: string };

export interface PromptPointEnvOverride {
	pointId: string;
	envVar: string;
}

export interface PointCatalogEntry {
	definition: PointDefinition;
	installations: readonly PointCatalogInstallation[];
}

export interface PointCatalog {
	entries: readonly PointCatalogEntry[];
	diagnostics: readonly ProjectConfigDiagnostic[];
}

export type PromptPointSource =
	| { type: "env"; pointId: string; envVar: string; path: string }
	| { type: "ns.toml"; pointId: string; path: string }
	| { type: "conventional"; pointId: string; path: string }
	| { type: "default"; pointId: string; path: string; manifestPath: string }
	| { type: "missing"; pointId: string };

export const nodeProjectConfigGateway: ProjectConfigGateway = {
	readTextFile(request) {
		try {
			return {
				type: "found",
				text: readFileSync(join(request.repoRoot, request.relativePath), "utf8"),
			};
		} catch (error) {
			if (isNodeFileNotFound(error)) return { type: "missing" };
			return { type: "error", message: formatErrorMessage(error) };
		}
	},
	pathExists(request) {
		try {
			return existsSync(join(request.repoRoot, request.relativePath))
				? { type: "present" }
				: { type: "missing" };
		} catch (error) {
			return { type: "error", message: formatErrorMessage(error) };
		}
	},
};

export function loadProjectConfig(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	pointDefinitions: readonly PointDefinition[];
	settingsSchemas?: readonly SettingsSchema[];
}): LoadProjectConfigResult {
	const readResult = request.gateway.readTextFile({
		repoRoot: request.repoRoot,
		relativePath: "ns.toml",
	});
	if (readResult.type === "missing") {
		return {
			ok: true,
			config: { points: [], settings: new Map() },
			diagnostics: [],
		};
	}
	if (readResult.type === "error") {
		return {
			ok: false,
			diagnostics: [
				diagnostic("ns_toml_read_failed", `Failed to read ns.toml: ${readResult.message}`),
			],
		};
	}
	return parseProjectConfigToml(readResult.text, {
		pathLabel: "ns.toml",
		pointDefinitions: request.pointDefinitions,
		settingsSchemas: request.settingsSchemas ?? [],
	});
}

export function parseProjectConfigToml(
	source: string,
	request: {
		pathLabel?: string;
		pointDefinitions?: readonly PointDefinition[];
		settingsSchemas?: readonly SettingsSchema[];
	},
): LoadProjectConfigResult {
	const pathLabel = request.pathLabel ?? "ns.toml";
	let parsed: unknown;
	try {
		parsed = parse(source);
	} catch (error) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("ns_toml_invalid", `${pathLabel}: Invalid TOML.\n${formatErrorMessage(error)}`),
			],
		};
	}

	const documentResult = tomlDocumentSchema.safeParse(parsed);
	if (!documentResult.success) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("ns_toml_invalid", `${pathLabel}: top-level TOML document must be a table.`),
			],
		};
	}

	const document = documentResult.data;
	const pointsResult =
		request.pointDefinitions === undefined
			? { installations: [], diagnostics: [] }
			: parsePointsTable({
					pathLabel,
					value: document["points"],
					pointDefinitions: request.pointDefinitions,
				});
	const settingsResult = parseDeclaredSettings({
		pathLabel,
		document,
		settingsSchemas: request.settingsSchemas ?? [],
	});
	const diagnostics = [...pointsResult.diagnostics, ...settingsResult.diagnostics];

	const config = { points: pointsResult.installations, settings: settingsResult.settings };
	if (diagnostics.length > 0) return { ok: false, config, diagnostics };
	return { ok: true, config, diagnostics: [] };
}

export function discoverPointDefinitionsInRoot(rootDir: string): PointDefinitionDiscoveryResult {
	const rootScan = scanExtensionRoot(rootDir);
	if (rootScan.diagnostics.length > 0) {
		return { pointDefinitions: [], diagnostics: rootScan.diagnostics };
	}

	const pointDefinitions: PointDefinition[] = [];
	const diagnostics: ProjectConfigDiagnostic[] = [];
	for (const entry of rootScan.entries) {
		if (entry.type !== "directory" || entry.packageJsonPath === undefined) continue;
		const packageResult = discoverPackagePointDefinitions(entry.packageJsonPath);
		pointDefinitions.push(...packageResult.pointDefinitions);
		diagnostics.push(...packageResult.diagnostics);
	}

	return { pointDefinitions, diagnostics };
}

export function loadPointCatalog(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	pointDefinitions?: readonly PointDefinition[];
	extensionRoot?: string;
	settingsSchemas?: readonly SettingsSchema[];
	promptEnvOverrides?: readonly PromptPointEnvOverride[];
	env?: Record<string, string | undefined>;
}): PointCatalog {
	const definitionResult =
		request.pointDefinitions === undefined
			? discoverPointDefinitionsInRoot(
					join(request.repoRoot, request.extensionRoot ?? ".ns/extensions"),
				)
			: { pointDefinitions: request.pointDefinitions, diagnostics: [] };
	const configResult = loadProjectConfig({
		repoRoot: request.repoRoot,
		gateway: request.gateway,
		pointDefinitions: definitionResult.pointDefinitions,
		settingsSchemas: request.settingsSchemas ?? [],
	});
	return buildPointCatalog({
		repoRoot: request.repoRoot,
		gateway: request.gateway,
		pointDefinitions: definitionResult.pointDefinitions,
		config: configResult.config ?? { points: [], settings: new Map() },
		diagnostics: [...definitionResult.diagnostics, ...configResult.diagnostics],
		promptEnvOverrides: request.promptEnvOverrides ?? [],
		env: request.env ?? {},
	});
}

export function resolvePromptPointSource(
	catalog: PointCatalog,
	pointId: string,
): PromptPointSource {
	const entry = catalog.entries.find((catalogEntry) => catalogEntry.definition.id === pointId);
	if (entry === undefined || entry.definition.accepts !== "prompt")
		return { type: "missing", pointId };

	const envOverride = findCatalogInstallation(entry, "env-prompt");
	if (envOverride !== undefined) {
		return {
			type: "env",
			pointId,
			envVar: envOverride.envVar,
			path: envOverride.path,
		};
	}

	const configured = findPromptConfigInstallation(entry);
	if (configured !== undefined) {
		return { type: "ns.toml", pointId, path: configured.installation.path };
	}

	const conventional = findCatalogInstallation(entry, "conventional-prompt");
	if (conventional !== undefined) {
		return { type: "conventional", pointId, path: conventional.path };
	}

	if (entry.definition.defaultPath !== undefined && entry.definition.manifestPath !== undefined) {
		return {
			type: "default",
			pointId,
			path: entry.definition.defaultPath,
			manifestPath: entry.definition.manifestPath,
		};
	}

	return { type: "missing", pointId };
}

export function computePointCatalog(request: BuildPointCatalogRequest): PointCatalog {
	return buildPointCatalog(request);
}

export interface BuildPointCatalogRequest {
	repoRoot: string;
	gateway: Pick<ProjectConfigGateway, "pathExists">;
	pointDefinitions: readonly PointDefinition[];
	config: LoadedProjectConfig;
	diagnostics?: readonly ProjectConfigDiagnostic[];
	promptEnvOverrides?: readonly PromptPointEnvOverride[];
	env?: Record<string, string | undefined>;
}

export function buildPointCatalog(request: BuildPointCatalogRequest): PointCatalog {
	const diagnostics: ProjectConfigDiagnostic[] = [...(request.diagnostics ?? [])];
	const installationsByPoint = new Map<string, PointCatalogInstallation[]>();
	for (const installation of request.config.points) {
		const existing = installationsByPoint.get(installation.pointId) ?? [];
		installationsByPoint.set(installation.pointId, [
			...existing,
			{ source: "ns.toml", installation },
		]);
	}

	const entries: PointCatalogEntry[] = [];
	for (const definition of [...request.pointDefinitions].sort((left, right) =>
		left.id.localeCompare(right.id),
	)) {
		let installations = installationsByPoint.get(definition.id) ?? [];
		if (definition.accepts === "prompt") {
			const envOverride = findPromptEnvOverride({
				pointId: definition.id,
				env: request.env ?? {},
				overrides: request.promptEnvOverrides ?? [],
			});
			if (envOverride !== undefined) {
				installations = [{ source: "env-prompt", ...envOverride }, ...installations];
				diagnostics.push(
					diagnostic(
						"point_prompt_env_override_in_effect",
						`Prompt point ${definition.id} is overridden by env var ${envOverride.envVar}.`,
						{ path: definition.id, severity: "info" },
					),
				);
			}
		}
		if (definition.accepts === "prompt" && installations.length === 0) {
			const conventionalPath = `.ns/prompts/${definition.id}.md`;
			const existsResult = request.gateway.pathExists?.({
				repoRoot: request.repoRoot,
				relativePath: conventionalPath,
			});
			if (existsResult?.type === "present") {
				installations = [
					{ source: "conventional-prompt", pointId: definition.id, path: conventionalPath },
				];
			} else if (existsResult?.type === "error") {
				diagnostics.push(
					diagnostic(
						"point_conventional_prompt_probe_failed",
						`Failed to inspect conventional prompt installation ${conventionalPath}: ${existsResult.message}`,
						{ path: conventionalPath },
					),
				);
			}
		}

		if (definition.semantics === "override" && installations.length > 0) {
			diagnostics.push(
				diagnostic(
					"point_override_in_effect",
					`Override point ${definition.id} has a repo installation in effect.`,
					{ path: definition.id, severity: "info" },
				),
			);
		} else if (installations.length === 0) {
			diagnostics.push(
				diagnostic(
					"point_defined_uninstalled",
					`Point ${definition.id} is defined but not installed in this repo.`,
					{ path: definition.id, severity: "info" },
				),
			);
		}

		entries.push({ definition, installations });
	}

	return { entries, diagnostics };
}

export function hookCommandsForPoint(catalog: PointCatalog, pointId: string): readonly string[] {
	const entry = catalog.entries.find((catalogEntry) => catalogEntry.definition.id === pointId);
	if (entry === undefined) return [];
	const installation = findCatalogInstallation(entry, "ns.toml");
	if (installation?.installation.accepts !== "hook") return [];
	return installation.installation.commands;
}

export function resolvePromptPointPath(
	repoRoot: string,
	source: PromptPointSource,
): { path: string; label: string } | undefined {
	switch (source.type) {
		case "env":
			return {
				path: resolve(repoRoot, source.path),
				label: `${source.envVar} prompt ${source.path}`,
			};
		case "ns.toml":
			return { path: join(repoRoot, source.path), label: `ns.toml prompt ${source.path}` };
		case "conventional":
			return { path: join(repoRoot, source.path), label: source.path };
		case "default":
			return {
				path: join(dirname(source.manifestPath), source.path),
				label: `manifest default ${source.path}`,
			};
		case "missing":
			return undefined;
	}
}

function findCatalogInstallation<TSource extends PointCatalogInstallation["source"]>(
	entry: PointCatalogEntry,
	source: TSource,
): Extract<PointCatalogInstallation, { source: TSource }> | undefined {
	return entry.installations.find(
		(installation): installation is Extract<PointCatalogInstallation, { source: TSource }> =>
			installation.source === source,
	);
}

function findPromptConfigInstallation(entry: PointCatalogEntry):
	| {
			source: "ns.toml";
			installation: Extract<ProjectPointInstallation, { accepts: "prompt" }>;
	  }
	| undefined {
	return entry.installations.find(
		(
			installation,
		): installation is {
			source: "ns.toml";
			installation: Extract<ProjectPointInstallation, { accepts: "prompt" }>;
		} => installation.source === "ns.toml" && installation.installation.accepts === "prompt",
	);
}

function findPromptEnvOverride(request: {
	pointId: string;
	env: Record<string, string | undefined>;
	overrides: readonly PromptPointEnvOverride[];
}): { pointId: string; envVar: string; path: string } | undefined {
	const override = request.overrides.find((candidate) => candidate.pointId === request.pointId);
	if (override === undefined) return undefined;
	const path = request.env[override.envVar]?.trim();
	if (!path) return undefined;
	return { pointId: request.pointId, envVar: override.envVar, path };
}

function parsePointsTable(request: {
	pathLabel: string;
	value: unknown;
	pointDefinitions: readonly PointDefinition[];
}): {
	installations: readonly ProjectPointInstallation[];
	diagnostics: readonly ProjectConfigDiagnostic[];
} {
	if (request.value === undefined) return { installations: [], diagnostics: [] };
	const diagnostics: ProjectConfigDiagnostic[] = [];
	const tableResult = recordSchema.safeParse(request.value);
	if (!tableResult.success) {
		diagnostics.push(
			diagnostic("points_table_invalid", `${request.pathLabel}: [points] must be a TOML table.`, {
				path: "points",
			}),
		);
		return { installations: [], diagnostics };
	}

	const definitions = new Map(
		request.pointDefinitions.map((definition) => [definition.id, definition]),
	);
	const installations: ProjectPointInstallation[] = [];
	for (const [pointId, value] of Object.entries(tableResult.data)) {
		const definition = definitions.get(pointId);
		if (definition === undefined) {
			diagnostics.push(
				diagnostic(
					"point_installation_undefined",
					`${request.pathLabel}: [points].${JSON.stringify(pointId)} installs an undefined point.`,
					{ path: `points.${pointId}` },
				),
			);
			continue;
		}
		const parsed = parsePointInstallation({
			pathLabel: request.pathLabel,
			pointId,
			definition,
			value,
		});
		if (parsed.ok) installations.push(parsed.installation);
		else diagnostics.push(parsed.diagnostic);
	}
	return { installations, diagnostics };
}

function parsePointInstallation(request: {
	pathLabel: string;
	pointId: string;
	definition: PointDefinition;
	value: unknown;
}):
	| { ok: true; installation: ProjectPointInstallation }
	| { ok: false; diagnostic: ProjectConfigDiagnostic } {
	if (request.definition.accepts === "hook") {
		return parseInstallationValue({
			...request,
			schema: z.array(z.string()),
			invalidMessage: `${request.pathLabel}: hook point ${request.pointId} must be an array of command strings.`,
			buildInstallation: (commands) => ({
				pointId: request.pointId,
				accepts: "hook",
				commands,
			}),
		});
	}

	return parseInstallationValue({
		...request,
		schema: z.string().min(1),
		invalidMessage: `${request.pathLabel}: prompt point ${request.pointId} must be a non-empty path string.`,
		buildInstallation: (path) => ({ pointId: request.pointId, accepts: "prompt", path }),
	});
}

function parseInstallationValue<T>(request: {
	pointId: string;
	value: unknown;
	schema: ZodType<T>;
	invalidMessage: string;
	buildInstallation: (value: T) => ProjectPointInstallation;
}):
	| { ok: true; installation: ProjectPointInstallation }
	| { ok: false; diagnostic: ProjectConfigDiagnostic } {
	const valueResult = request.schema.safeParse(request.value);
	if (!valueResult.success) {
		return {
			ok: false,
			diagnostic: diagnostic("point_installation_invalid", request.invalidMessage, {
				path: `points.${request.pointId}`,
			}),
		};
	}
	return { ok: true, installation: request.buildInstallation(valueResult.data) };
}

function parseDeclaredSettings(request: {
	pathLabel: string;
	document: Record<string, unknown>;
	settingsSchemas: readonly SettingsSchema[];
}): {
	settings: ReadonlyMap<string, unknown>;
	diagnostics: readonly ProjectConfigDiagnostic[];
} {
	const settings = new Map<string, unknown>();
	const diagnostics: ProjectConfigDiagnostic[] = [];
	for (const setting of request.settingsSchemas) {
		const settingValue = valueAtPath(request.document, setting.path);
		if (settingValue === undefined) continue;
		const schemaResult = setting.schema.safeParse(settingValue);
		const key = setting.path.join(".");
		if (!schemaResult.success) {
			const message =
				setting.invalidMessage?.({ pathLabel: request.pathLabel, key }) ??
				`${request.pathLabel}: [${key}] does not match its declared settings schema.`;
			diagnostics.push(diagnostic("settings_table_invalid", message, { path: key }));
			continue;
		}
		settings.set(key, schemaResult.data);
	}
	return { settings, diagnostics };
}

function valueAtPath(
	document: Record<string, unknown>,
	path: readonly [string, ...string[]],
): unknown {
	let current: unknown = document;
	for (const segment of path) {
		const tableResult = recordSchema.safeParse(current);
		if (!tableResult.success) return undefined;
		current = tableResult.data[segment];
		if (current === undefined) return undefined;
	}
	return current;
}

function discoverPackagePointDefinitions(packageJsonPath: string): PointDefinitionDiscoveryResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(
					"extension_manifest_parse_failed",
					`Could not parse extension manifest ${packageJsonPath}.\n${formatErrorMessage(error)}`,
					{ path: packageJsonPath },
				),
			],
		};
	}

	const manifestResult = nsExtensionPackageManifestSchema.safeParse(parsed);
	if (!manifestResult.success) {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(
					"extension_manifest_invalid",
					`Extension manifest contains invalid ns metadata: ${packageJsonPath}.`,
					{ path: packageJsonPath },
				),
			],
		};
	}

	const manifest = manifestResult.data;
	if (manifest.ns?.points === undefined) return { pointDefinitions: [], diagnostics: [] };
	const group = readManifestNameSegment(manifest.ns.group);
	if (group === undefined) {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(
					"extension_manifest_point_group_invalid",
					`Extension manifest point group must be a non-empty segment: ${packageJsonPath}.`,
					{ path: packageJsonPath },
				),
			],
		};
	}

	const pointDefinitions: PointDefinition[] = [];
	const diagnostics: ProjectConfigDiagnostic[] = [];
	const location = { packageJsonPath, packageDir: dirname(packageJsonPath) };
	for (const point of manifest.ns.points) {
		const pointResult = pointDefinitionFromManifestPoint({
			group,
			location,
			point,
		});
		if (pointResult.ok) pointDefinitions.push(pointResult.definition);
		else diagnostics.push(...pointResult.diagnostics);
	}
	return { pointDefinitions, diagnostics };
}

interface PackageManifestLocation {
	packageJsonPath: string;
	packageDir: string;
}

function pointDefinitionFromManifestPoint(request: {
	group: string;
	location: PackageManifestLocation;
	point: unknown;
}):
	| { ok: true; definition: PointDefinition }
	| { ok: false; diagnostics: readonly ProjectConfigDiagnostic[] } {
	const pointResult = nsExtensionManifestPointSchema.safeParse(request.point);
	if (!pointResult.success) {
		return {
			ok: false,
			diagnostics: [
				diagnostic(
					"extension_manifest_point_invalid",
					`Extension manifest points must be objects with supported known fields: ${request.location.packageJsonPath}.`,
					{ path: request.location.packageJsonPath },
				),
			],
		};
	}

	const point = pointResult.data;
	const path = parsePointManifestPath(point.path);
	const diagnostics: ProjectConfigDiagnostic[] = [...path.diagnostics];
	if (point.accepts === undefined) {
		diagnostics.push(manifestPointFieldDiagnostic("accepts", request.location.packageJsonPath));
	}
	if (point.semantics === undefined) {
		diagnostics.push(manifestPointFieldDiagnostic("semantics", request.location.packageJsonPath));
	}

	let defaultPath: string | undefined;
	if (point.default !== undefined) {
		const defaultValidation = validateManifestRelativePath({
			location: request.location,
			rawPath: point.default,
		});
		if (defaultValidation.ok) defaultPath = point.default;
		else diagnostics.push(defaultValidation.diagnostic);
	}

	if (
		diagnostics.length > 0 ||
		path.value === undefined ||
		point.accepts === undefined ||
		point.semantics === undefined
	) {
		return { ok: false, diagnostics };
	}

	const description = readNonEmptyString(point.description);
	return {
		ok: true,
		definition: {
			id: [request.group, ...path.value].join("."),
			accepts: point.accepts,
			semantics: point.semantics,
			...(description === undefined ? {} : { description }),
			...(defaultPath === undefined ? {} : { defaultPath }),
			manifestPath: request.location.packageJsonPath,
		},
	};
}

function parsePointManifestPath(value: unknown): {
	value: readonly string[] | undefined;
	diagnostics: readonly ProjectConfigDiagnostic[];
} {
	if (!Array.isArray(value) || value.length === 0) {
		return {
			value: undefined,
			diagnostics: [manifestPointFieldDiagnostic("path", undefined)],
		};
	}
	const segments = value.filter((segment): segment is string => typeof segment === "string");
	if (
		segments.length !== value.length ||
		segments.some((segment) => readManifestNameSegment(segment) === undefined)
	) {
		return {
			value: undefined,
			diagnostics: [manifestPointFieldDiagnostic("path", undefined)],
		};
	}
	return { value: segments, diagnostics: [] };
}

function validateManifestRelativePath(request: {
	location: PackageManifestLocation;
	rawPath: string;
}): { ok: true } | { ok: false; diagnostic: ProjectConfigDiagnostic } {
	if (
		request.rawPath.trim() === "" ||
		request.rawPath.startsWith("/") ||
		request.rawPath.includes("\\")
	) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_manifest_point_default_not_relative",
				`Extension manifest point default must be a relative POSIX-style path inside the package: ${request.rawPath}.`,
				{ path: request.location.packageJsonPath },
			),
		};
	}
	if (!request.rawPath.endsWith(".md")) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_manifest_point_default_not_markdown",
				`Extension manifest point default must be a markdown file path: ${request.rawPath}.`,
				{ path: request.location.packageJsonPath },
			),
		};
	}
	const resolvedPath = resolve(request.location.packageDir, request.rawPath);
	if (!isPathInside(request.location.packageDir, resolvedPath)) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_manifest_point_default_escapes",
				`Extension manifest point default must not escape its package directory: ${request.rawPath}.`,
				{ path: request.location.packageJsonPath },
			),
		};
	}
	return { ok: true };
}

function manifestPointFieldDiagnostic(
	field: string,
	packageJsonPath: string | undefined,
): ProjectConfigDiagnostic {
	return diagnostic(
		"extension_manifest_point_field_invalid",
		`Extension manifest point ${field} is required and must match the point manifest schema.`,
		packageJsonPath === undefined ? {} : { path: packageJsonPath },
	);
}

function readManifestNameSegment(value: unknown): string | undefined {
	return typeof value === "string" && NS_COMMAND_NAME_PATTERN.test(value) ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function diagnostic(
	code: string,
	message: string,
	options: { path?: string; severity?: ProjectConfigDiagnostic["severity"] } = {},
): ProjectConfigDiagnostic {
	return {
		severity: options.severity ?? "error",
		code,
		message,
		...(options.path === undefined ? {} : { path: options.path }),
	};
}

function isNodeFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

const recordSchema = z.record(z.string(), z.unknown());
const tomlDocumentSchema = recordSchema;
