import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { parse } from "smol-toml";
import { z, type ZodType } from "zod";

import { makeKernelDiagnostic } from "../runtime/diagnostics.ts";
import { loadNsUserModuleDefault } from "../runtime/module-loader.ts";
import {
	extensionPointAcceptsValues,
	validateExtensionDescriptor,
	type ExtensionDescriptor,
} from "../sdk/descriptor.ts";
import {
	parseDeclaredExtensionSpecsToml,
	resolveAcquiredDescriptorPackageRoot,
	resolveDescriptorExportPath,
} from "./descriptor-package.ts";

export { extensionPointAcceptsValues };
export const pointSemanticsValues = ["additive", "override"] as const;
export type PointAccepts = (typeof extensionPointAcceptsValues)[number];
export type PointSemantics = (typeof pointSemanticsValues)[number];

export interface PointDefinition {
	id: string;
	accepts: PointAccepts;
	semantics: PointSemantics;
	description?: string;
	defaultPath?: string;
	manifestPath?: string;
}

const builtInPointDefinitions = [
	{
		id: "branch-context.plans-write",
		accepts: "prompt",
		semantics: "override",
		description: "Custom prompt body for saved-plan authoring.",
		defaultPath: "prompts/plans-write-default.md",
	},
	{
		id: "flow.submit.pr-description",
		accepts: "prompt",
		semantics: "override",
		description: "Prompt for generating pull request descriptions during flow submit.",
	},
	{
		id: "flow.submit.pre",
		accepts: "hook",
		semantics: "additive",
		description: "Commands to run before flow submit checkpointing.",
	},
] as const satisfies readonly PointDefinition[];

export interface SettingsSchema<T = unknown> {
	path: readonly [string, ...string[]];
	schema: ZodType<T>;
	invalidMessage?: (context: { pathLabel: string }) => string;
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

export type PromptPointSource =
	| ({ type: "env" } & ResolvedPromptEnvOverride)
	| { type: "ns.toml"; pointId: string; path: string }
	| { type: "conventional"; pointId: string; path: string }
	| { type: "default"; pointId: string; path: string; manifestPath: string }
	| { type: "missing"; pointId: string };

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

async function discoverDescriptorPointDefinitions(
	repoRoot: string,
	gateway: ProjectConfigGateway,
): Promise<PointDefinitionDiscoveryResult> {
	const declared = readDeclaredExtensionSpecs(repoRoot, gateway);
	if (!declared.ok) return { pointDefinitions: [], diagnostics: [declared.diagnostic] };
	const pointDefinitions: PointDefinition[] = [];
	const diagnostics: ProjectConfigDiagnostic[] = [];
	for (const spec of declared.specs) {
		const loaded = await loadDescriptorPointDefinitions({ repoRoot, spec });
		pointDefinitions.push(...loaded.pointDefinitions);
		diagnostics.push(...loaded.diagnostics);
	}
	return { pointDefinitions, diagnostics };
}

function readDeclaredExtensionSpecs(
	repoRoot: string,
	gateway: ProjectConfigGateway,
): { ok: true; specs: readonly string[] } | { ok: false; diagnostic: ProjectConfigDiagnostic } {
	const readResult = gateway.readTextFile({ repoRoot, relativePath: "ns.toml" });
	if (readResult.type === "missing") return { ok: true, specs: [] };
	if (readResult.type === "error") {
		return {
			ok: false,
			diagnostic: diagnostic("ns_toml_read_failed", readResult.message, { path: "ns.toml" }),
		};
	}
	const parsed = parseDeclaredExtensionSpecsToml(readResult.text);
	if (parsed.ok) return parsed;
	return {
		ok: false,
		diagnostic: diagnostic(
			parsed.reason === "invalid-toml" ? "ns_toml_invalid" : "ns_toml_extensions_invalid",
			parsed.reason === "invalid-toml"
				? `ns.toml: Invalid TOML.\n${parsed.message}`
				: parsed.message,
			{ path: parsed.reason === "invalid-toml" ? "ns.toml" : "extensions" },
		),
	};
}

async function loadDescriptorPointDefinitions(request: {
	repoRoot: string;
	spec: string;
}): Promise<PointDefinitionDiscoveryResult> {
	const acquisition = resolveAcquiredDescriptorPackageRoot({
		repoRoot: request.repoRoot,
		spec: request.spec,
	});
	const packageDir = acquisition.packageRoot;
	const packageJsonPath = join(packageDir, "package.json");
	const descriptorPath = resolveDescriptorExport(packageDir, packageJsonPath);
	if (!descriptorPath.ok) return { pointDefinitions: [], diagnostics: [descriptorPath.diagnostic] };
	let descriptorExport: unknown;
	try {
		descriptorExport = await loadNsUserModuleDefault(descriptorPath.path);
	} catch (error) {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic(
					"extension_descriptor_import_failed",
					`Failed to load ns extension descriptor ${descriptorPath.path}.\n${formatErrorMessage(error)}`,
					{ path: descriptorPath.path },
				),
			],
		};
	}
	const validation = validateExtensionDescriptor(descriptorExport, descriptorPath.path);
	if (!validation.ok) {
		return {
			pointDefinitions: [],
			diagnostics: [
				diagnostic("extension_descriptor_invalid", validation.message, {
					path: descriptorPath.path,
				}),
			],
		};
	}
	return {
		pointDefinitions: pointDefinitionsForDescriptor(validation.descriptor, descriptorPath.path),
		diagnostics: [],
	};
}

function resolveDescriptorExport(
	packageDir: string,
	packageJsonPath: string,
): { ok: true; path: string } | { ok: false; diagnostic: ProjectConfigDiagnostic } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_descriptor_package_json_read_failed",
				`Could not read extension package manifest ${packageJsonPath}.\n${formatErrorMessage(error)}`,
				{ path: packageJsonPath },
			),
		};
	}
	const exportPath = resolveDescriptorExportPath(packageDir, parsed);
	if (!exportPath.ok) return descriptorExportDiagnostic(exportPath, packageJsonPath);
	try {
		if (!statSync(exportPath.path).isFile()) throw new Error("not a file");
	} catch {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_descriptor_export_missing_file",
				`Extension descriptor export does not resolve to a file: ${exportPath.target}.`,
				{ path: packageJsonPath },
			),
		};
	}
	return { ok: true, path: exportPath.path };
}

function descriptorExportDiagnostic(
	result: Exclude<ReturnType<typeof resolveDescriptorExportPath>, { ok: true }>,
	packageJsonPath: string,
): { ok: false; diagnostic: ProjectConfigDiagnostic } {
	if (result.reason === "missing") {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_descriptor_export_missing",
				`Extension package must expose exports["./ns-extension"]: ${packageJsonPath}.`,
				{ path: packageJsonPath },
			),
		};
	}
	return {
		ok: false,
		diagnostic: diagnostic(
			result.reason === "invalid"
				? "extension_descriptor_export_invalid"
				: "extension_descriptor_export_escapes",
			result.reason === "invalid"
				? `Extension descriptor export must be a relative POSIX path: ${result.target}.`
				: `Extension descriptor export must stay inside the package: ${result.target}.`,
			{ path: packageJsonPath },
		),
	};
}

function pointDefinitionsForDescriptor(
	descriptor: ExtensionDescriptor,
	descriptorPath: string,
): readonly PointDefinition[] {
	return (descriptor.points ?? []).map((point) => ({
		id: point.id,
		accepts: point.accepts,
		semantics: point.cardinality === "many" ? "additive" : "override",
		...optionalEntry("description", point.description),
		...optionalEntry("defaultPath", point.default),
		manifestPath: descriptorPath,
	}));
}

export function loadPointCatalog(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	pointDefinitions?: readonly PointDefinition[];
	settingsSchemas?: readonly SettingsSchema[];
	promptEnvOverride?: PromptPointEnvOverride;
	env?: Record<string, string | undefined>;
}): PointCatalog {
	const definitionResult =
		request.pointDefinitions === undefined
			? { pointDefinitions: builtInPointDefinitions, diagnostics: [] }
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
		config: configResult.config ?? emptyLoadedProjectConfig,
		diagnostics: [...definitionResult.diagnostics, ...configResult.diagnostics],
		...optionalEntry("promptEnvOverride", request.promptEnvOverride),
		env: request.env ?? {},
	});
}

export async function loadPointCatalogWithDescriptors(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	pointDefinitions?: readonly PointDefinition[];
	settingsSchemas?: readonly SettingsSchema[];
	promptEnvOverride?: PromptPointEnvOverride;
	env?: Record<string, string | undefined>;
}): Promise<PointCatalog> {
	const descriptorDefinitionResult =
		request.pointDefinitions === undefined
			? await discoverDescriptorPointDefinitions(request.repoRoot, request.gateway)
			: { pointDefinitions: request.pointDefinitions, diagnostics: [] };
	const pointDefinitions =
		request.pointDefinitions === undefined
			? [...builtInPointDefinitions, ...descriptorDefinitionResult.pointDefinitions]
			: descriptorDefinitionResult.pointDefinitions;
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
		diagnostics: [...descriptorDefinitionResult.diagnostics, ...configResult.diagnostics],
		...optionalEntry("promptEnvOverride", request.promptEnvOverride),
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
	source: Exclude<PromptPointSource, { type: "env" }>,
): { path: string; label: string } | undefined {
	switch (source.type) {
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
	return makeKernelDiagnostic({
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
