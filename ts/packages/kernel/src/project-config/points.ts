import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { isPathInside } from "@nseng-ai/foundation/primitives";
import { parse } from "smol-toml";
import { z, type ZodType } from "zod";

import {
	nsExtensionManifestPointSchema,
	nsExtensionPackageManifestSchema,
} from "../sdk/extension-manifest.ts";

export type PointAccepts = "hook" | "prompt";
export type PointSemantics = "additive" | "override";

export type PointDefinition = {
	id: string;
	accepts: PointAccepts;
	semantics: PointSemantics;
	description?: string;
	defaultPath?: string;
	manifestPath?: string;
};

export type SettingsSchema = {
	path: readonly [string, ...string[]];
	schema: ZodType;
};

export type ProjectConfigGateway = {
	readTextFile: (request: { repoRoot: string; relativePath: string }) => ProjectConfigReadResult;
	pathExists?: (request: {
		repoRoot: string;
		relativePath: string;
	}) => ProjectConfigPathExistsResult;
};

export type ProjectConfigReadResult =
	| { type: "found"; text: string }
	| { type: "missing" }
	| { type: "error"; message: string };

export type ProjectConfigPathExistsResult =
	| { type: "present" }
	| { type: "missing" }
	| { type: "error"; message: string };

export type ProjectConfigDiagnostic = {
	severity: "error" | "info";
	code: string;
	message: string;
	path?: string;
};

export type ProjectPointInstallation =
	| { pointId: string; accepts: "hook"; commands: readonly string[] }
	| { pointId: string; accepts: "prompt"; path: string };

export type LoadedProjectConfig = {
	points: readonly ProjectPointInstallation[];
	settings: ReadonlyMap<string, unknown>;
};

export type LoadProjectConfigResult =
	| { ok: true; config: LoadedProjectConfig; diagnostics: readonly ProjectConfigDiagnostic[] }
	| { ok: false; diagnostics: readonly ProjectConfigDiagnostic[]; config?: LoadedProjectConfig };

export type PointDefinitionDiscoveryResult = {
	pointDefinitions: readonly PointDefinition[];
	diagnostics: readonly ProjectConfigDiagnostic[];
};

export type PointCatalogInstallation =
	| { source: "env-prompt"; pointId: string; envVar: string; path: string }
	| { source: "ns.toml"; installation: ProjectPointInstallation }
	| { source: "conventional-prompt"; pointId: string; path: string };

export type PromptPointEnvOverride = {
	pointId: string;
	envVar: string;
};

export type PointCatalogEntry = {
	definition: PointDefinition;
	installations: readonly PointCatalogInstallation[];
};

export type PointCatalog = {
	entries: readonly PointCatalogEntry[];
	diagnostics: readonly ProjectConfigDiagnostic[];
};

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
			return { type: "error", message: formatUnknownError(error) };
		}
	},
	pathExists(request) {
		try {
			return existsSync(join(request.repoRoot, request.relativePath))
				? { type: "present" }
				: { type: "missing" };
		} catch (error) {
			return { type: "error", message: formatUnknownError(error) };
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
		pointDefinitions: readonly PointDefinition[];
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
				diagnostic("ns_toml_invalid", `${pathLabel}: Invalid TOML.\n${formatUnknownError(error)}`),
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

	const diagnostics: ProjectConfigDiagnostic[] = [];
	const document = documentResult.data;
	const points = parsePointsTable({
		pathLabel,
		value: document["points"],
		pointDefinitions: request.pointDefinitions,
		diagnostics,
	});
	const settings = parseDeclaredSettings({
		pathLabel,
		document,
		settingsSchemas: request.settingsSchemas ?? [],
		diagnostics,
	});

	const config = { points, settings };
	if (diagnostics.length > 0) return { ok: false, config, diagnostics };
	return { ok: true, config, diagnostics: [] };
}

export function discoverPointDefinitionsInRoot(rootDir: string): PointDefinitionDiscoveryResult {
	if (!existsSync(rootDir)) return { pointDefinitions: [], diagnostics: [] };

	const rootInspection = inspectDirectory(rootDir, "extension root");
	if (!rootInspection.ok) return { pointDefinitions: [], diagnostics: [rootInspection.diagnostic] };
	if (!rootInspection.isDirectory) {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(
					"extension_root_not_directory",
					`Extension root must be a directory: ${rootDir}.`,
					{ path: rootDir },
				),
			],
		};
	}

	let entries;
	try {
		entries = readdirSync(rootDir, { withFileTypes: true });
	} catch (error) {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(
					"extension_root_read_failed",
					`Could not read extension root ${rootDir}.\n${formatUnknownError(error)}`,
					{ path: rootDir },
				),
			],
		};
	}

	const pointDefinitions: PointDefinition[] = [];
	const diagnostics: ProjectConfigDiagnostic[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (!entry.isDirectory()) continue;
		const packageJsonPath = join(rootDir, entry.name, "package.json");
		if (!existsSync(packageJsonPath)) continue;
		const packageResult = discoverPackagePointDefinitions(packageJsonPath);
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
	return computePointCatalog({
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

	const envOverride = entry.installations.find(
		(installation) => installation.source === "env-prompt",
	);
	if (envOverride?.source === "env-prompt") {
		return {
			type: "env",
			pointId,
			envVar: envOverride.envVar,
			path: envOverride.path,
		};
	}

	const configured = entry.installations.find(
		(installation) =>
			installation.source === "ns.toml" && installation.installation.accepts === "prompt",
	);
	if (configured?.source === "ns.toml" && configured.installation.accepts === "prompt") {
		return { type: "ns.toml", pointId, path: configured.installation.path };
	}

	const conventional = entry.installations.find(
		(installation) => installation.source === "conventional-prompt",
	);
	if (conventional?.source === "conventional-prompt") {
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

export function computePointCatalog(request: {
	repoRoot: string;
	gateway: Pick<ProjectConfigGateway, "pathExists">;
	pointDefinitions: readonly PointDefinition[];
	config: LoadedProjectConfig;
	diagnostics?: readonly ProjectConfigDiagnostic[];
	promptEnvOverrides?: readonly PromptPointEnvOverride[];
	env?: Record<string, string | undefined>;
}): PointCatalog {
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
					infoDiagnostic(
						"point_prompt_env_override_in_effect",
						`Prompt point ${definition.id} is overridden by env var ${envOverride.envVar}.`,
						{ path: definition.id },
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
				infoDiagnostic(
					"point_override_in_effect",
					`Override point ${definition.id} has a repo installation in effect.`,
					{ path: definition.id },
				),
			);
		} else if (installations.length === 0) {
			diagnostics.push(
				infoDiagnostic(
					"point_defined_uninstalled",
					`Point ${definition.id} is defined but not installed in this repo.`,
					{ path: definition.id },
				),
			);
		}

		entries.push({ definition, installations });
	}

	return { entries, diagnostics };
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
	diagnostics: ProjectConfigDiagnostic[];
}): readonly ProjectPointInstallation[] {
	if (request.value === undefined) return [];
	const tableResult = recordSchema.safeParse(request.value);
	if (!tableResult.success) {
		request.diagnostics.push(
			diagnostic("points_table_invalid", `${request.pathLabel}: [points] must be a TOML table.`, {
				path: "points",
			}),
		);
		return [];
	}

	const definitions = new Map(
		request.pointDefinitions.map((definition) => [definition.id, definition]),
	);
	const installations: ProjectPointInstallation[] = [];
	for (const [pointId, value] of Object.entries(tableResult.data)) {
		const definition = definitions.get(pointId);
		if (definition === undefined) {
			request.diagnostics.push(
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
		else request.diagnostics.push(parsed.diagnostic);
	}
	return installations;
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
		const valueResult = z.array(z.string()).safeParse(request.value);
		if (!valueResult.success) {
			return {
				ok: false,
				diagnostic: diagnostic(
					"point_installation_invalid",
					`${request.pathLabel}: hook point ${request.pointId} must be an array of command strings.`,
					{ path: `points.${request.pointId}` },
				),
			};
		}
		return {
			ok: true,
			installation: { pointId: request.pointId, accepts: "hook", commands: valueResult.data },
		};
	}

	const valueResult = z.string().min(1).safeParse(request.value);
	if (!valueResult.success) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"point_installation_invalid",
				`${request.pathLabel}: prompt point ${request.pointId} must be a non-empty path string.`,
				{ path: `points.${request.pointId}` },
			),
		};
	}
	return {
		ok: true,
		installation: { pointId: request.pointId, accepts: "prompt", path: valueResult.data },
	};
}

function parseDeclaredSettings(request: {
	pathLabel: string;
	document: Record<string, unknown>;
	settingsSchemas: readonly SettingsSchema[];
	diagnostics: ProjectConfigDiagnostic[];
}): ReadonlyMap<string, unknown> {
	const settings = new Map<string, unknown>();
	for (const setting of request.settingsSchemas) {
		const settingValue = valueAtPath(request.document, setting.path);
		if (settingValue === undefined) continue;
		const schemaResult = setting.schema.safeParse(settingValue);
		const key = setting.path.join(".");
		if (!schemaResult.success) {
			request.diagnostics.push(
				diagnostic(
					"settings_table_invalid",
					`${request.pathLabel}: [${key}] does not match its declared settings schema.`,
					{ path: key },
				),
			);
			continue;
		}
		settings.set(key, schemaResult.data);
	}
	return settings;
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
					`Could not parse extension manifest ${packageJsonPath}.\n${formatUnknownError(error)}`,
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
	for (const point of manifest.ns.points) {
		const pointResult = pointDefinitionFromManifestPoint({
			group,
			packageJsonPath,
			packageDir: dirname(packageJsonPath),
			point,
		});
		if (pointResult.ok) pointDefinitions.push(pointResult.definition);
		else diagnostics.push(...pointResult.diagnostics);
	}
	return { pointDefinitions, diagnostics };
}

function pointDefinitionFromManifestPoint(request: {
	group: string;
	packageJsonPath: string;
	packageDir: string;
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
					`Extension manifest points must be objects with supported known fields: ${request.packageJsonPath}.`,
					{ path: request.packageJsonPath },
				),
			],
		};
	}

	const point = pointResult.data;
	const path = parsePointManifestPath(point.path);
	const diagnostics: ProjectConfigDiagnostic[] = [...path.diagnostics];
	if (point.accepts === undefined) {
		diagnostics.push(manifestPointFieldDiagnostic("accepts", request.packageJsonPath));
	}
	if (point.semantics === undefined) {
		diagnostics.push(manifestPointFieldDiagnostic("semantics", request.packageJsonPath));
	}

	let defaultPath: string | undefined;
	if (point.default !== undefined) {
		const defaultValidation = validateManifestRelativePath({
			packageDir: request.packageDir,
			packageJsonPath: request.packageJsonPath,
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
			manifestPath: request.packageJsonPath,
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
	packageDir: string;
	packageJsonPath: string;
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
				{ path: request.packageJsonPath },
			),
		};
	}
	if (!request.rawPath.endsWith(".md")) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_manifest_point_default_not_markdown",
				`Extension manifest point default must be a markdown file path: ${request.rawPath}.`,
				{ path: request.packageJsonPath },
			),
		};
	}
	const resolvedPath = resolve(request.packageDir, request.rawPath);
	if (!isPathInside(request.packageDir, resolvedPath)) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_manifest_point_default_escapes",
				`Extension manifest point default must not escape its package directory: ${request.rawPath}.`,
				{ path: request.packageJsonPath },
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

function inspectDirectory(
	path: string,
	label: string,
): { ok: true; isDirectory: boolean } | { ok: false; diagnostic: ProjectConfigDiagnostic } {
	try {
		return { ok: true, isDirectory: statSync(path).isDirectory() };
	} catch (error) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_root_stat_failed",
				`Could not inspect ${label} ${path}.\n${formatUnknownError(error)}`,
				{ path },
			),
		};
	}
}

function readManifestNameSegment(value: unknown): string | undefined {
	return typeof value === "string" && /^[a-z][a-z0-9-]*$/u.test(value) ? value : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function diagnostic(
	code: string,
	message: string,
	options: { path?: string } = {},
): ProjectConfigDiagnostic {
	return {
		severity: "error",
		code,
		message,
		...(options.path === undefined ? {} : { path: options.path }),
	};
}

function infoDiagnostic(
	code: string,
	message: string,
	options: { path?: string } = {},
): ProjectConfigDiagnostic {
	return {
		severity: "info",
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

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

const recordSchema = z.record(z.string(), z.unknown());
const tomlDocumentSchema = recordSchema;
