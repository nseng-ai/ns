import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { parse } from "smol-toml";
import { z, type ZodType } from "zod";

import { makeSdkDiagnostic } from "../runtime/diagnostics.ts";
import {
	extensionPointAcceptsValues,
	extensionPointCardinalityValues,
	type ExtensionDescriptor,
} from "../sdk/descriptor.ts";

export { extensionPointAcceptsValues, extensionPointCardinalityValues };
export type PointAccepts = (typeof extensionPointAcceptsValues)[number];
export type PointCardinality = (typeof extensionPointCardinalityValues)[number];

export interface PointDefinition {
	id: string;
	accepts: PointAccepts;
	cardinality: PointCardinality;
	description?: string;
	defaultPath?: string;
	manifestPath?: string;
}

export interface PreloadedPointDescriptor {
	descriptor: ExtensionDescriptor;
	descriptorPath: string;
}

export const builtInPointDefinitions = [
	{
		id: "branch-context.plans-write",
		accepts: "prompt",
		cardinality: "one",
		description: "Custom prompt body for saved-plan authoring.",
		defaultPath: "prompts/plans-write-default.md",
	},
	{
		id: "flow.submit.pr-inventory",
		accepts: "prompt",
		cardinality: "one",
		description: "Prompt for generating pull request inventories during flow submit.",
	},
	{
		id: "flow.submit.pre",
		accepts: "hook",
		cardinality: "many",
		description: "Commands to run before flow submit checkpointing.",
	},
	{
		id: "flow.submit.pre.recovery",
		accepts: "prompt",
		cardinality: "one",
		description: "Agent guidance after a flow submit pre-check failure.",
	},
] as const satisfies readonly PointDefinition[];

export interface SettingsSchema<T = unknown> {
	path: readonly [string, ...string[]];
	schema: ZodType<T>;
	invalidMessage?: (context: { pathLabel: string }) => string;
}

export const nsTomlExtensionsSettingsSchema = {
	path: ["extensions"] as const,
	schema: z.array(z.string().min(1)),
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel} top-level extensions must be a string array of non-empty source specs.`,
} satisfies SettingsSchema<readonly string[]>;

export function isUnsupportedNsTomlExtensionSpec(value: string): boolean {
	return value.startsWith("npm:") || value.startsWith("git:");
}

export function resolveDeclaredLocalExtensionRoots(
	rootDir: string,
	extensions: readonly string[],
): readonly string[] {
	return [
		...new Set(
			extensions.filter(isLocalNsTomlExtensionSpec).map((extension) => resolve(rootDir, extension)),
		),
	].sort((left, right) => left.localeCompare(right));
}

function isLocalNsTomlExtensionSpec(value: string): boolean {
	return !isUnsupportedNsTomlExtensionSpec(value);
}

export interface ProjectConfigGateway {
	readTextFile: (request: { repoRoot: string; relativePath: string }) => ProjectConfigReadResult;
	pathExists: (request: {
		repoRoot: string;
		relativePath: string;
	}) => ProjectConfigPathExistsResult;
}

type ProjectConfigProbeResult<T> = T | { type: "missing" } | { type: "error"; message: string };

export type ProjectConfigReadResult = ProjectConfigProbeResult<{ type: "found"; text: string }>;

export type ProjectConfigPathExistsResult = ProjectConfigProbeResult<{ type: "present" }>;

export interface ProjectConfigDiagnostic {
	severity: "error" | "info";
	code: string;
	message: string;
	path?: string;
	causeMessage?: string;
}

export interface ProjectConfigDiagnosticErrorMapping<TCode extends string> {
	invalidToml: TCode;
	invalidSettingsByPath?: Readonly<Record<string, TCode>>;
	defaultCode: TCode;
	defaultMessage?: string;
	pathLabel?: string;
}

export interface ProjectConfigMappedError<TCode extends string> {
	code: TCode;
	message: string;
}

export function primaryProjectConfigDiagnostic(
	diagnostics: readonly ProjectConfigDiagnostic[],
): ProjectConfigDiagnostic | undefined {
	return diagnostics.find((candidate) => candidate.severity === "error") ?? diagnostics[0];
}

export function projectConfigErrorFromDiagnostics<TCode extends string>(
	diagnostics: readonly ProjectConfigDiagnostic[],
	mapping: ProjectConfigDiagnosticErrorMapping<TCode>,
): ProjectConfigMappedError<TCode> {
	const diagnostic = primaryProjectConfigDiagnostic(diagnostics);
	if (diagnostic?.code === "ns_toml_invalid") {
		return {
			code: mapping.invalidToml,
			message: formatProjectConfigInvalidTomlMessage(diagnostic, mapping.pathLabel),
		};
	}
	if (diagnostic?.code === "settings_table_invalid" && diagnostic.path !== undefined) {
		const settingsCode = projectConfigSettingsCode(mapping.invalidSettingsByPath, diagnostic.path);
		return {
			code: settingsCode ?? mapping.defaultCode,
			message: diagnostic.message,
		};
	}
	return {
		code: mapping.defaultCode,
		message: diagnostic?.message ?? mapping.defaultMessage ?? "invalid ns.toml",
	};
}

function projectConfigSettingsCode<TCode extends string>(
	codes: ProjectConfigDiagnosticErrorMapping<TCode>["invalidSettingsByPath"],
	path: string,
): TCode | undefined {
	if (codes === undefined) return undefined;
	return codes[path];
}

function formatProjectConfigInvalidTomlMessage(
	diagnostic: ProjectConfigDiagnostic,
	pathLabel: string | undefined,
): string {
	if (diagnostic.causeMessage === undefined) return diagnostic.message;
	if (pathLabel !== undefined) return `Invalid TOML in ${pathLabel}: ${diagnostic.causeMessage}`;
	return `Invalid TOML.\n${diagnostic.causeMessage}`;
}

export type ProjectPointInstallation =
	| { pointId: string; accepts: "hook"; commands: readonly string[] }
	| { pointId: string; accepts: "prompt"; path: string };

export interface LoadedProjectConfig {
	points: readonly ProjectPointInstallation[];
	settings: ReadonlyMap<string, unknown>;
}

export type ProjectConfigPointsTableMode =
	| { mode: "validate"; pointDefinitions: readonly PointDefinition[] }
	| { mode: "skip" };

export function getProjectConfigSetting<T>(
	config: LoadedProjectConfig,
	schema: SettingsSchema<T>,
): T | undefined {
	return config.settings.get(schema.path.join(".")) as T | undefined;
}

export const emptyLoadedProjectConfig: LoadedProjectConfig = { points: [], settings: new Map() };

export type LoadProjectConfigResult =
	| { ok: true; config: LoadedProjectConfig; diagnostics: readonly ProjectConfigDiagnostic[] }
	| { ok: false; diagnostics: readonly ProjectConfigDiagnostic[]; config?: LoadedProjectConfig };

export interface PointDefinitionDiscoveryResult {
	pointDefinitions: readonly PointDefinition[];
	diagnostics: readonly ProjectConfigDiagnostic[];
}

export interface ResolvedPromptEnvOverride {
	pointId: string;
	envVar: string;
	path: string;
}

export type PointCatalogInstallation =
	| ({ source: "env-prompt" } & ResolvedPromptEnvOverride)
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

export interface EnvPromptPointSource {
	type: "env";
	pointId: string;
	envVar: string;
	path: string;
}

export interface NsTomlPromptPointSource {
	type: "ns.toml";
	pointId: string;
	path: string;
}

export interface ConventionalPromptPointSource {
	type: "conventional";
	pointId: string;
	path: string;
}

export interface DefaultPromptPointSource {
	type: "default";
	pointId: string;
	path: string;
	manifestPath: string;
}

export interface MissingPromptPointSource {
	type: "missing";
	pointId: string;
}

export type PromptPointSource =
	| EnvPromptPointSource
	| NsTomlPromptPointSource
	| ConventionalPromptPointSource
	| DefaultPromptPointSource
	| MissingPromptPointSource;

function tryProjectConfigProbe<T>(
	probe: () => ProjectConfigProbeResult<T>,
): ProjectConfigProbeResult<T> {
	try {
		return probe();
	} catch (error) {
		if (isNodeFileNotFound(error)) return { type: "missing" };
		return { type: "error", message: formatErrorMessage(error) };
	}
}

export const nodeProjectConfigGateway: ProjectConfigGateway = {
	readTextFile(request) {
		return tryProjectConfigProbe(() => ({
			type: "found",
			text: readFileSync(join(request.repoRoot, request.relativePath), "utf8"),
		}));
	},
	pathExists(request) {
		return tryProjectConfigProbe(() =>
			existsSync(join(request.repoRoot, request.relativePath))
				? { type: "present" }
				: { type: "missing" },
		);
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
			config: emptyLoadedProjectConfig,
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
		pointsTable: { mode: "validate", pointDefinitions: request.pointDefinitions },
		settingsSchemas: request.settingsSchemas ?? [],
	});
}

export function parseProjectConfigToml(
	source: string,
	request: {
		pathLabel?: string;
		pointsTable: ProjectConfigPointsTableMode;
		settingsSchemas?: readonly SettingsSchema[];
	},
): LoadProjectConfigResult {
	const pathLabel = request.pathLabel ?? "ns.toml";
	let parsed: unknown;
	try {
		parsed = parse(source);
	} catch (error) {
		const causeMessage = formatErrorMessage(error);
		return {
			ok: false,
			diagnostics: [
				diagnostic("ns_toml_invalid", `${pathLabel}: Invalid TOML.\n${causeMessage}`, {
					causeMessage,
				}),
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
		request.pointsTable.mode === "skip"
			? { installations: [], diagnostics: [] }
			: parsePointsTable({
					pathLabel,
					value: document["points"],
					pointDefinitions: request.pointsTable.pointDefinitions,
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

export function pointDefinitionsForDescriptor(
	descriptor: ExtensionDescriptor,
	descriptorPath: string,
): readonly PointDefinition[] {
	return (descriptor.points ?? []).map((point) => ({
		id: point.id,
		accepts: point.accepts,
		cardinality: point.cardinality,
		...optionalEntry("description", point.description),
		...optionalEntry("defaultPath", point.default),
		manifestPath: descriptorPath,
	}));
}

export function loadPointCatalog(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	pointDefinitions?: readonly PointDefinition[];
	preferredDescriptors?: readonly PreloadedPointDescriptor[];
	settingsSchemas?: readonly SettingsSchema[];
	promptEnvOverride?: PromptPointEnvOverride;
	env?: Record<string, string | undefined>;
}): PointCatalog {
	const fallbackDefinitions = request.pointDefinitions ?? builtInPointDefinitions;
	const preferredDefinitions = (request.preferredDescriptors ?? []).flatMap((preloaded) =>
		pointDefinitionsForDescriptor(preloaded.descriptor, preloaded.descriptorPath),
	);
	const pointDefinitions =
		preferredDefinitions.length === 0
			? fallbackDefinitions
			: mergePointDefinitions({ fallbackDefinitions, preferredDefinitions });
	const configResult = loadProjectConfig({
		repoRoot: request.repoRoot,
		gateway: request.gateway,
		pointDefinitions,
		settingsSchemas: request.settingsSchemas ?? [],
	});
	return buildPointCatalog({
		repoRoot: request.repoRoot,
		gateway: request.gateway,
		pointDefinitions,
		config: configResult.config ?? emptyLoadedProjectConfig,
		diagnostics: configResult.diagnostics,
		...optionalEntry("promptEnvOverride", request.promptEnvOverride),
		env: request.env ?? {},
	});
}

export interface ScopedPointDefinition {
	definition: PointDefinition;
	/** Human-readable source label used in same-scope conflict diagnostics. */
	sourceLabel: string;
}

export interface LayeredPointDefinitionsResult {
	pointDefinitions: readonly PointDefinition[];
	diagnostics: readonly ProjectConfigDiagnostic[];
}

/**
 * Compose point definitions across contribution layers (ADR 0055):
 * built-in fallback < enabled User < Project. Project definitions replace
 * User definitions by full point ID; duplicate IDs within one scope exclude
 * every conflicting definition at that scope with a deterministic
 * source-labelled diagnostic.
 */
export function composeLayeredPointDefinitions(request: {
	fallbackDefinitions: readonly PointDefinition[];
	userDefinitions: readonly ScopedPointDefinition[];
	projectDefinitions: readonly ScopedPointDefinition[];
}): LayeredPointDefinitionsResult {
	const user = excludeSameScopeConflicts("user", request.userDefinitions);
	const project = excludeSameScopeConflicts("project", request.projectDefinitions);
	const projectIds = new Set(project.pointDefinitions.map((definition) => definition.id));
	const survivingUser = user.pointDefinitions.filter(
		(definition) => !projectIds.has(definition.id),
	);
	const replacedIds = new Set([...projectIds, ...survivingUser.map((definition) => definition.id)]);
	return {
		pointDefinitions: [
			...request.fallbackDefinitions.filter((definition) => !replacedIds.has(definition.id)),
			...survivingUser,
			...project.pointDefinitions,
		],
		diagnostics: [...user.diagnostics, ...project.diagnostics],
	};
}

function excludeSameScopeConflicts(
	scope: "user" | "project",
	definitions: readonly ScopedPointDefinition[],
): LayeredPointDefinitionsResult {
	const byId = new Map<string, ScopedPointDefinition[]>();
	for (const scoped of definitions) {
		const existing = byId.get(scoped.definition.id) ?? [];
		byId.set(scoped.definition.id, [...existing, scoped]);
	}
	const surviving: PointDefinition[] = [];
	const diagnostics: ProjectConfigDiagnostic[] = [];
	for (const [pointId, scopedDefinitions] of byId) {
		if (scopedDefinitions.length === 1 && scopedDefinitions[0] !== undefined) {
			surviving.push(scopedDefinitions[0].definition);
			continue;
		}
		const sources = scopedDefinitions
			.map((scoped) => scoped.sourceLabel)
			.sort((left, right) => left.localeCompare(right));
		diagnostics.push(
			diagnostic(
				"point_definition_duplicate_in_scope",
				`Point ${pointId} is defined more than once at ${scope} scope; every conflicting definition is excluded: ${sources.join(", ")}.`,
				{ path: pointId },
			),
		);
	}
	return { pointDefinitions: surviving, diagnostics };
}

function mergePointDefinitions(request: {
	fallbackDefinitions: readonly PointDefinition[];
	preferredDefinitions: readonly PointDefinition[];
}): readonly PointDefinition[] {
	const preferredIds = new Set(request.preferredDefinitions.map((definition) => definition.id));
	return [
		...request.fallbackDefinitions.filter((definition) => !preferredIds.has(definition.id)),
		...request.preferredDefinitions,
	];
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

export interface BuildPointCatalogRequest {
	repoRoot: string;
	gateway: Pick<ProjectConfigGateway, "pathExists">;
	pointDefinitions: readonly PointDefinition[];
	config: LoadedProjectConfig;
	diagnostics?: readonly ProjectConfigDiagnostic[];
	promptEnvOverride?: PromptPointEnvOverride;
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
				...optionalEntry("override", request.promptEnvOverride),
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
			const existsResult = request.gateway.pathExists({
				repoRoot: request.repoRoot,
				relativePath: conventionalPath,
			});
			if (existsResult.type === "present") {
				installations = [
					{ source: "conventional-prompt", pointId: definition.id, path: conventionalPath },
				];
			} else if (existsResult.type === "error") {
				diagnostics.push(
					diagnostic(
						"point_conventional_prompt_probe_failed",
						`Failed to inspect conventional prompt installation ${conventionalPath}: ${existsResult.message}`,
						{ path: conventionalPath },
					),
				);
			}
		}

		if (definition.cardinality === "one" && installations.length > 0) {
			diagnostics.push(
				diagnostic(
					"point_installation_in_effect",
					`Cardinality-one point ${definition.id} has a repo installation in effect.`,
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
	override?: PromptPointEnvOverride;
}): ResolvedPromptEnvOverride | undefined {
	if (request.override?.pointId !== request.pointId) return undefined;
	const path = request.env[request.override.envVar]?.trim();
	if (!path) return undefined;
	return { pointId: request.pointId, envVar: request.override.envVar, path };
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
				setting.invalidMessage?.({ pathLabel: request.pathLabel }) ??
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

function diagnostic(
	code: string,
	message: string,
	options: {
		path?: string;
		causeMessage?: string;
		severity?: ProjectConfigDiagnostic["severity"];
	} = {},
): ProjectConfigDiagnostic {
	return makeSdkDiagnostic({
		code,
		message,
		...optionalEntry("path", options.path),
		extra: optionalEntry("causeMessage", options.causeMessage),
		...optionalEntry("severity", options.severity),
	});
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
