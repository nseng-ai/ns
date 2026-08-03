import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	commandInfoForLoadedCommand,
	commandKey,
	commandLeafName,
	toCommandCliInfo,
	commandPathMatches,
	commandSegments,
	listBuiltInNsCommandCandidates,
	validateDescriptorCommandContribution,
	type BuiltInNsCommandCandidate,
	type NsCommandCandidate,
	type NsCommandCliInfo,
	type NsCommandPath,
	type NsCommandSourceInfo,
	type NsCommandSourceKind,
	type NsCommandSourceLevel,
} from "./command-registry.ts";
import { nextDescriptorTraversalState } from "./descriptor-traversal.ts";
import {
	declaredExtensionSourceIdentity,
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionDescriptorDiagnostic,
	type DeclaredExtensionDescriptorGateway,
	type DeclaredExtensionNpmPackageRootResolver,
} from "./declared-descriptors.ts";
import { NS_EXTENSION_HELP_GROUP } from "./help-presentation.ts";
import { loadExtensionDescriptorFromPackageRoot } from "../project-config/extension-package-descriptor.ts";
import { loadNsExtensionContribution, type ExtensionLoadDiagnostic } from "./loader.ts";
import { loadEffectiveUserExtensionLayer } from "./user-extension-layer.ts";
import {
	loadedModuleReference,
	moduleReferenceDisplay,
	packageModuleReference,
	type NsCommandModuleLoader,
	type NsCommandModuleReference,
} from "./module-reference.ts";
import {
	isPathInside,
	optionalEntries,
	optionalEntry,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";
import {
	type ExtensionCommandEntry,
	type ExtensionDescriptor,
	type ExtensionEntry,
} from "../sdk/descriptor.ts";
import {
	declaredExtensionSpecsErrorInfo,
	parseDeclaredExtensionSpecsToml,
} from "../project-config/descriptor-package.ts";
import type { DescriptorCommand } from "../sdk/index.ts";
import {
	planExtensionPackageAdmission,
	type ExtensionPackageAdmissionDiagnostic,
	type ExtensionPackageContribution,
} from "./package-admission.ts";

export type ExtensionSourceLevel = NsCommandSourceLevel;
export type ExtensionSourceInfo = NsCommandSourceInfo;

export interface NsCommandCatalog {
	candidates: ReadonlyMap<string, ExtensionCommandCandidate>;
	commandInfos: readonly NsCommandCliInfo[];
	diagnostics: readonly ExtensionDiagnostic[];
	extensionPackageNames: ReadonlySet<string>;
	builtInPackageNames: ReadonlySet<string>;
}

interface LoadedCatalogFragment {
	readonly diagnostics: readonly ExtensionDiagnostic[];
	readonly contributions: readonly CatalogPackageContribution[];
	readonly builtInPackageNames: readonly string[];
}

type CatalogPackageContribution = ExtensionPackageContribution<
	readonly ExtensionCommandCandidate[]
>;

interface LoadedProjectCatalogFragment extends LoadedCatalogFragment {
	readonly declaredSourceIdentities: readonly string[];
}

export type ExtensionCommandCandidate = BuiltInNsCommandCandidate | ExternalNsCommandCandidate;

export interface ExternalNsCommandCandidate extends NsCommandCandidate {
	moduleReference: NsCommandModuleReference;
	entryPath?: string;
	/** Validated manifest name of the descriptor package that contributed this command. */
	extensionPackageName?: string;
	hasStaticCommandInfo: boolean;
	descriptorEntry?: ExtensionCommandEntry;
	packageName?: string;
	contributionId?: string;
}

export type ExtensionDiagnostic = ExtensionErrorDiagnostic | ExtensionOverrideDiagnostic;

export interface ExtensionErrorDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path?: string;
	sourceLevel?: ExtensionSourceLevel;
	commandName?: string;
	affectedCommandNames?: readonly string[];
}

export interface ExtensionOverrideDiagnostic {
	severity: "info";
	code: "extension_command_override";
	message: string;
	commandName: string;
	overriddenSource: ExtensionSourceInfo;
	overridingSource: ExtensionSourceInfo;
}

export type SelectedNsCommandLoadResult =
	| {
			ok: true;
			command: DescriptorCommand;
			source: ExtensionSourceInfo;
			path: NsCommandPath & Pick<NsCommandCliInfo, "helpGroup" | "sourceKind">;
	  }
	| { ok: false; diagnostic: ExtensionErrorDiagnostic };

export interface DiagnosticClassification {
	fatal: readonly ExtensionErrorDiagnostic[];
	warnings: readonly ExtensionErrorDiagnostic[];
}

export type PreinstalledNsCommandCatalogEntry =
	| PreinstalledNsCommandPackageCatalogEntry
	| PreinstalledNsCommandLoadedCatalogEntry;

export interface PreinstalledNsCommandCatalogEntryBase {
	readonly group?: string;
	readonly groupDescription?: string;
	readonly helpGroup?: string;
	readonly name: string;
	readonly description: string;
	readonly fullDescription: string;
	readonly path?: readonly string[];
	readonly hiddenAncestorKeys?: readonly string[];
	readonly hasStaticCommandInfo?: boolean;
	readonly packageName?: string;
	readonly contributionId?: string;
	readonly requiresExtensions?: readonly string[];
}

export interface PreinstalledNsCommandPackageCatalogEntry extends PreinstalledNsCommandCatalogEntryBase {
	readonly moduleSpecifier: string;
	readonly load?: undefined;
}

export interface PreinstalledNsCommandLoadedCatalogEntry extends PreinstalledNsCommandCatalogEntryBase {
	readonly displayPath: string;
	readonly load: NsCommandModuleLoader;
}

export interface PreinstalledNsCommandCatalog {
	readonly entries: readonly PreinstalledNsCommandCatalogEntry[];
	readonly extensionPackageNames: readonly string[];
	readonly builtInPackageNames: readonly string[];
}

export type PreinstalledNsCommandCatalogLoader = () =>
	| PreinstalledNsCommandCatalog
	| Promise<PreinstalledNsCommandCatalog>;

export interface LoadNsCommandCatalogOptions {
	cwd: string;
	homeDir?: string;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	preinstalledCommandCatalog?: PreinstalledNsCommandCatalogLoader;
}

export type UserExtensionPackageAvailabilityDiagnostic =
	| DeclaredExtensionDescriptorDiagnostic
	| ExtensionPackageAdmissionDiagnostic;

export type UserExtensionPackageAvailabilityFact =
	| {
			readonly sourceSpec: string;
			readonly availability: "available";
			readonly packageName: string;
			readonly commandPaths: readonly string[];
			readonly diagnostics: readonly UserExtensionPackageAvailabilityDiagnostic[];
	  }
	| {
			readonly sourceSpec: string;
			readonly availability: "unavailable";
			readonly packageName?: string;
			readonly diagnostics: readonly UserExtensionPackageAvailabilityDiagnostic[];
	  };

export interface EvaluateUserExtensionPackageAvailabilityOptions {
	readonly configDir: string;
	readonly sourceSpecs: readonly string[];
	readonly preinstalledCommandCatalog: PreinstalledNsCommandCatalogLoader;
	readonly descriptorGateway?: DeclaredExtensionDescriptorGateway;
	readonly resolveNpmPackageRoot?: DeclaredExtensionNpmPackageRootResolver;
}

/** Evaluate every User declaration against Built-in and injected Preinstalled packages, never Project. */
export async function evaluateUserExtensionPackageAvailability(
	options: EvaluateUserExtensionPackageAvailabilityOptions,
): Promise<readonly UserExtensionPackageAvailabilityFact[]> {
	const loaded = await loadDeclaredExtensionDescriptors({
		repoRoot: options.configDir,
		specs: options.sourceSpecs,
		localPathPolicy: "absolute-only",
		...optionalEntries({
			gateway: options.descriptorGateway,
			resolveNpmPackageRoot: options.resolveNpmPackageRoot,
		}),
	});
	const preinstalledCatalog = await options.preinstalledCommandCatalog();
	const preinstalled = preinstalledCatalogContributions(preinstalledCatalog.entries);
	const representedPackageNames = new Set(
		preinstalled.map((contribution) => contribution.packageName),
	);
	const commandlessPreinstalled = preinstalledCatalog.extensionPackageNames
		.filter((packageName) => !representedPackageNames.has(packageName))
		.map(
			(packageName): CatalogPackageContribution => ({
				contributionId: `preinstalled:catalog:${packageName}`,
				packageName,
				level: "preinstalled",
				commandKeys: [],
				commandMetadata: [],
				requiresExtensions: [],
				payload: [],
			}),
		);
	const userContributions = loaded.descriptors.map((record, index) =>
		descriptorPackageContribution({
			cwd: options.configDir,
			record,
			sourceLevel: "user",
			sourceLabel: `user ns.toml descriptor ${record.spec}`,
			contributionId: `user-availability:${index}:${declaredExtensionSourceIdentity(options.configDir, record.spec) ?? record.spec}`,
		}),
	);
	const admission = planExtensionPackageAdmission({
		contributions: [...preinstalled, ...commandlessPreinstalled, ...userContributions],
		builtInCommandKeys: listBuiltInNsCommandCandidates().map(commandKey),
	});
	return options.sourceSpecs.map((sourceSpec) => {
		const descriptorIndex = loaded.descriptors.findIndex((record) => record.spec === sourceSpec);
		const descriptor = loaded.descriptors[descriptorIndex];
		const loadDiagnostics = loaded.diagnostics.filter(
			(diagnostic) =>
				diagnostic.spec === sourceSpec || diagnostic.relatedSpecs?.includes(sourceSpec) === true,
		);
		if (descriptor === undefined) {
			return {
				sourceSpec,
				availability: "unavailable" as const,
				diagnostics: loadDiagnostics,
			};
		}
		const contribution = userContributions[descriptorIndex];
		if (contribution === undefined) throw new Error(`Missing User contribution for ${sourceSpec}.`);
		const admissionDiagnostics = admission.diagnostics.filter(
			(diagnostic) => diagnostic.contributionId === contribution.contributionId,
		);
		if (
			admission.rejected.some(
				(candidate) => candidate.contributionId === contribution.contributionId,
			)
		) {
			return {
				sourceSpec,
				availability: "unavailable" as const,
				packageName: descriptor.packageName,
				diagnostics: [...loadDiagnostics, ...admissionDiagnostics],
			};
		}
		return {
			sourceSpec,
			availability: "available" as const,
			packageName: descriptor.packageName,
			commandPaths: contribution.commandKeys,
			diagnostics: [...loadDiagnostics, ...admissionDiagnostics],
		};
	});
}

const ORDERED_SOURCE_LEVELS = [
	"built-in",
	"preinstalled",
	"user",
	"project",
] as const satisfies readonly ExtensionSourceLevel[];

export async function loadNsCommandCatalog(
	options: LoadNsCommandCatalogOptions,
): Promise<NsCommandCatalog> {
	const diagnostics: ExtensionDiagnostic[] = [];
	const builtInCandidates = listBuiltInNsCommandCandidates();
	const preinstalledCandidates = await loadPreinstalledCandidates(
		options.preinstalledCommandCatalog,
		options.cwd,
	);
	diagnostics.push(...preinstalledCandidates.diagnostics);
	const descriptorProjectCandidates = await loadProjectDescriptorCandidates(options.cwd);
	const userCandidates = await loadUserDescriptorCandidates(
		options,
		new Set(descriptorProjectCandidates.declaredSourceIdentities),
	);
	diagnostics.push(...userCandidates.diagnostics);
	diagnostics.push(...descriptorProjectCandidates.diagnostics);
	const contributions = [
		...preinstalledCandidates.contributions,
		...userCandidates.contributions,
		...descriptorProjectCandidates.contributions,
	];
	const admission = planExtensionPackageAdmission({
		contributions,
		builtInCommandKeys: builtInCandidates.map(commandKey),
	});
	const admittedCandidates = admission.admitted
		.flatMap((contribution) => contribution.payload)
		.map(withDefaultPreinstalledHelpGroup)
		.sort((left, right) => commandKey(left).localeCompare(commandKey(right)));
	diagnostics.push(...admission.diagnostics);
	const mergedCandidates = [...builtInCandidates, ...admittedCandidates].sort((left, right) =>
		commandKey(left).localeCompare(commandKey(right)),
	);
	const builtInPackageNames = new Set(preinstalledCandidates.builtInPackageNames);
	return {
		candidates: new Map(mergedCandidates.map((candidate) => [commandKey(candidate), candidate])),
		commandInfos: mergedCandidates.map(toCommandCliInfo),
		diagnostics,
		extensionPackageNames: admission.extensionPackageNames,
		builtInPackageNames,
	};
}

export async function loadSelectedNsCommand(
	candidate: ExtensionCommandCandidate,
): Promise<SelectedNsCommandLoadResult> {
	if (isBuiltInCandidate(candidate)) {
		return { ok: true, command: candidate.command, source: candidate.source, path: candidate };
	}

	const loaded = await loadNsExtensionContribution(candidate.moduleReference);
	if (!loaded.ok) {
		return {
			ok: false,
			diagnostic: fromLoadDiagnostic(
				loaded.diagnostic,
				candidate.source.level,
				commandKey(candidate),
			),
		};
	}
	const validation = validateDescriptorCommandContribution(
		loaded.defaultExport,
		candidate.descriptorEntry ?? { name: commandLeafName(candidate) },
		formatSource(candidate.source),
	);
	if (!validation.ok) {
		return {
			ok: false,
			diagnostic: {
				severity: "error",
				code: "extension_command_invalid",
				message: validation.message,
				path: candidateDiagnosticPath(candidate),
				sourceLevel: candidate.source.level,
				commandName: commandKey(candidate),
			},
		};
	}
	return { ok: true, command: validation.command, source: candidate.source, path: candidate };
}

export async function loadListingCommandInfos(
	catalog: NsCommandCatalog,
	options: { groupSegments?: readonly string[] } = {},
): Promise<{
	commandInfos: readonly NsCommandCliInfo[];
	diagnostics: readonly ExtensionErrorDiagnostic[];
}> {
	const loadedInfos: Array<{
		commandInfo: NsCommandCliInfo;
		diagnostic: ExtensionErrorDiagnostic | undefined;
	}> = [];
	for (const candidate of catalog.candidates.values()) {
		if (!shouldLoadListingCandidate(candidate, options.groupSegments)) {
			loadedInfos.push({ commandInfo: toCommandCliInfo(candidate), diagnostic: undefined });
			continue;
		}
		if (isBuiltInCandidate(candidate)) {
			loadedInfos.push({ commandInfo: toCommandCliInfo(candidate), diagnostic: undefined });
			continue;
		}
		if (candidate.moduleReference.type === "package" || candidate.hasStaticCommandInfo) {
			loadedInfos.push({ commandInfo: toCommandCliInfo(candidate), diagnostic: undefined });
			continue;
		}
		const loaded = await loadSelectedNsCommand(candidate);
		if (!loaded.ok) {
			loadedInfos.push({ commandInfo: toCommandCliInfo(candidate), diagnostic: loaded.diagnostic });
			continue;
		}
		loadedInfos.push({
			commandInfo: commandInfoForLoadedCommand(loaded.command, loaded.source.level, loaded.path),
			diagnostic: undefined,
		});
	}
	return {
		commandInfos: loadedInfos.map((loaded) => loaded.commandInfo),
		diagnostics: loadedInfos.flatMap((loaded) =>
			loaded.diagnostic === undefined ? [] : [loaded.diagnostic],
		),
	};
}

function shouldLoadListingCandidate(
	candidate: ExtensionCommandCandidate,
	groupSegments: readonly string[] | undefined,
): boolean {
	if (groupSegments === undefined) return true;
	const segments = commandSegments(candidate);
	if (segments.length <= groupSegments.length) return false;
	return groupSegments.every((segment, index) => segments[index] === segment);
}

export function commandInfosForSelectedCommand(
	commandInfos: readonly NsCommandCliInfo[],
	loaded:
		| {
				command: DescriptorCommand;
				source: ExtensionSourceInfo;
				path: NsCommandPath & Pick<NsCommandCliInfo, "helpGroup" | "sourceKind">;
		  }
		| undefined,
): readonly NsCommandCliInfo[] {
	if (loaded === undefined) return commandInfos;
	const loadedInfo = commandInfoForLoadedCommand(loaded.command, loaded.source.level, loaded.path);
	return commandInfos.map((info) => (commandPathMatches(info, loadedInfo) ? loadedInfo : info));
}

export function classifyExtensionDiagnosticsForInvocation(options: {
	diagnostics: readonly ExtensionDiagnostic[];
	requestedCommandName: string | undefined;
	selectedCandidate: ExtensionCommandCandidate | undefined;
}): DiagnosticClassification {
	const errorDiagnostics = options.diagnostics.filter(
		(diagnostic): diagnostic is ExtensionErrorDiagnostic => diagnostic.severity === "error",
	);
	if (options.requestedCommandName === undefined) {
		const fatal = errorDiagnostics.filter(
			(diagnostic) => diagnostic.code === "extension_command_built_in_namespace_conflict",
		);
		return {
			fatal,
			warnings: errorDiagnostics.filter((diagnostic) => !fatal.includes(diagnostic)),
		};
	}

	const fatal: ExtensionErrorDiagnostic[] = [];
	const warnings: ExtensionErrorDiagnostic[] = [];
	for (const diagnostic of errorDiagnostics) {
		const affectsRequest =
			diagnostic.commandName === options.requestedCommandName ||
			diagnostic.affectedCommandNames?.includes(options.requestedCommandName) === true;
		if (!affectsRequest) {
			warnings.push(diagnostic);
			continue;
		}
		if (isFatalForSelectedCandidate(diagnostic, options.selectedCandidate)) {
			fatal.push(diagnostic);
			continue;
		}
		warnings.push(diagnostic);
	}
	return { fatal, warnings };
}

export function hasExtensionErrors(diagnostics: readonly ExtensionDiagnostic[]): boolean {
	return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function formatExtensionErrorDiagnostics(
	diagnostics: readonly ExtensionDiagnostic[],
): string {
	return formatExtensionDiagnosticMessages(
		diagnostics.filter(
			(diagnostic): diagnostic is ExtensionErrorDiagnostic => diagnostic.severity === "error",
		),
	);
}

export function formatExtensionWarningDiagnostics(
	diagnostics: readonly ExtensionErrorDiagnostic[],
): string {
	return formatExtensionDiagnosticMessages(diagnostics, { prefix: "Warning: " });
}

function formatExtensionDiagnosticMessages(
	diagnostics: readonly ExtensionErrorDiagnostic[],
	options: { prefix?: string } = {},
): string {
	const prefix = options.prefix ?? "";
	return diagnostics.map((diagnostic) => `${prefix}${diagnostic.message}`).join("\n");
}

function isFatalForSelectedCandidate(
	diagnostic: ExtensionErrorDiagnostic,
	selectedCandidate: ExtensionCommandCandidate | undefined,
): boolean {
	if (selectedCandidate === undefined) return true;
	if (diagnostic.sourceLevel === undefined) return true;
	return sourceLevelRank(diagnostic.sourceLevel) >= sourceLevelRank(selectedCandidate.source.level);
}

async function loadProjectDescriptorCandidates(cwd: string): Promise<LoadedProjectCatalogFragment> {
	const declared = readDeclaredExtensionSpecs(cwd);
	if (!declared.ok) {
		return {
			...emptyLoadedCatalogFragment([declared.diagnostic]),
			declaredSourceIdentities: [],
		};
	}
	const loaded = await loadDeclaredExtensionDescriptors({ repoRoot: cwd, specs: declared.specs });
	return {
		diagnostics: loaded.diagnostics.map((diagnostic) =>
			projectErrorDiagnostic(
				diagnostic.code,
				diagnostic.message,
				diagnostic.path ?? join(cwd, "ns.toml"),
			),
		),
		builtInPackageNames: [],
		declaredSourceIdentities: declared.specs.flatMap((spec) => {
			const identity = declaredExtensionSourceIdentity(cwd, spec);
			return identity === undefined ? [] : [identity];
		}),
		contributions: loaded.descriptors.map((record) =>
			descriptorPackageContribution({
				cwd,
				record,
				sourceLevel: "project",
				sourceLabel: `project ns.toml descriptor ${record.spec}`,
				contributionId: `project:${declaredExtensionSourceIdentity(cwd, record.spec) ?? record.spec}`,
			}),
		),
	};
}

async function loadUserDescriptorCandidates(
	options: LoadNsCommandCatalogOptions,
	projectSourceIdentities: ReadonlySet<string>,
): Promise<LoadedCatalogFragment> {
	const layer = await loadEffectiveUserExtensionLayer({
		...optionalEntries({ homeDir: options.homeDir, env: options.env }),
		projectSourceIdentities,
	});
	const userConfigDir =
		layer.userConfigPath === undefined ? undefined : dirname(layer.userConfigPath);
	return {
		diagnostics: layer.diagnostics.map((diagnostic) => ({
			severity: "error",
			code: diagnostic.code,
			message: diagnostic.message,
			...optionalEntry("path", diagnostic.path),
			sourceLevel: "user",
		})),
		builtInPackageNames: [],
		contributions: layer.descriptors.map((record) =>
			descriptorPackageContribution({
				cwd: options.cwd,
				record,
				sourceLevel: "user",
				sourceLabel: `user ns.toml descriptor ${record.spec}`,
				contributionId: `user:${
					userConfigDir === undefined
						? record.spec
						: (declaredExtensionSourceIdentity(userConfigDir, record.spec) ?? record.spec)
				}`,
			}),
		),
	};
}

function projectErrorDiagnostic(
	code: string,
	message: string,
	path: string,
): ExtensionErrorDiagnostic {
	return { severity: "error", code, message, path, sourceLevel: "project" };
}

function readDeclaredExtensionSpecs(
	cwd: string,
): { ok: true; specs: readonly string[] } | { ok: false; diagnostic: ExtensionErrorDiagnostic } {
	const nsTomlPath = join(cwd, "ns.toml");
	if (!existsSync(nsTomlPath)) return { ok: true, specs: [] };
	const parsed = parseDeclaredExtensionSpecsToml(readFileSync(nsTomlPath, "utf8"));
	if (parsed.ok) return parsed;
	const errorInfo = declaredExtensionSpecsErrorInfo(parsed);
	return {
		ok: false,
		diagnostic: projectErrorDiagnostic(errorInfo.code, errorInfo.message, nsTomlPath),
	};
}

function descriptorPackageContribution(options: {
	cwd: string;
	record: {
		readonly spec: string;
		readonly sourceKind: "local" | "npm";
		readonly descriptorPath: string;
		readonly packageName: string;
		readonly moduleRoot: string;
		readonly descriptor: ExtensionDescriptor;
	};
	sourceLevel: "user" | "project";
	sourceLabel: string;
	contributionId: string;
}): CatalogPackageContribution {
	const candidates = descriptorCommandCandidates({
		cwd: options.cwd,
		spec: options.record.spec,
		packageDir: options.record.moduleRoot,
		descriptorPath: options.record.descriptorPath,
		descriptor: options.record.descriptor,
		sourceLevel: options.sourceLevel,
		sourceLabel: options.sourceLabel,
		sourceKind: options.record.sourceKind,
		packageName: options.record.packageName,
		contributionId: options.contributionId,
	});
	return {
		contributionId: options.contributionId,
		packageName: options.record.packageName,
		level: options.sourceLevel,
		commandKeys: candidates.map(commandKey),
		commandMetadata: candidates.map(commandMetadata),
		requiresExtensions: options.record.descriptor.requiresExtensions ?? [],
		payload: candidates,
	};
}

function descriptorCommandCandidates(options: {
	cwd: string;
	spec: string;
	packageDir: string;
	descriptorPath: string;
	descriptor: ExtensionDescriptor;
	sourceLevel: ExtensionSourceLevel;
	sourceLabel: string;
	sourceKind: NsCommandSourceKind;
	packageName: string;
	contributionId: string;
}): readonly ExtensionCommandCandidate[] {
	const entries = options.descriptor.entries ?? [];
	return entries.flatMap((entry) =>
		descriptorEntryCommandCandidates({
			...options,
			entry,
			segments: options.descriptor.group === undefined ? [] : [options.descriptor.group],
			hiddenAncestorKeys: [],
			rootGroupDescription: options.descriptor.description,
		}),
	);
}

function descriptorEntryCommandCandidates(options: {
	cwd: string;
	spec: string;
	packageDir: string;
	descriptorPath: string;
	descriptor: ExtensionDescriptor;
	sourceLevel: ExtensionSourceLevel;
	sourceLabel: string;
	sourceKind: NsCommandSourceKind;
	packageName: string;
	contributionId: string;
	entry: ExtensionEntry;
	segments: readonly string[];
	hiddenAncestorKeys: readonly string[];
	rootGroupDescription: string;
}): readonly ExtensionCommandCandidate[] {
	if ("load" in options.entry) {
		const commandEntry = options.entry;
		const segments = [...options.segments, commandEntry.name];
		const commandInfoPath = descriptorCommandInfoPath({
			commandName: commandEntry.name,
			segments: options.segments,
			hiddenAncestorKeys: options.hiddenAncestorKeys,
			rootGroupDescription: options.rootGroupDescription,
		});
		const displayPath = `${relative(options.cwd, options.descriptorPath)}#${segments.join("/")}`;
		return [
			{
				...commandInfoPath,
				description: `Load ns descriptor command ${segments.join(" ")}.`,
				fullDescription: `Load ns descriptor command ${segments.join(" ")}.`,
				moduleReference: loadedModuleReference(displayPath, async () => {
					const module = await commandEntry.load();
					return module.default;
				}),
				packageName: options.packageName,
				contributionId: options.contributionId,
				...optionalEntry("extensionPackageName", options.packageName),
				sourceKind: options.sourceKind,
				descriptorEntry: commandEntry,
				hasStaticCommandInfo: false,
				entryPath: options.descriptorPath,
				source: {
					level: options.sourceLevel,
					label: options.sourceLabel,
					path: options.descriptorPath,
				},
			},
		];
	}
	const groupEntry = options.entry;
	const nextState = nextDescriptorTraversalState(groupEntry, options);
	return groupEntry.entries.flatMap((entry) =>
		descriptorEntryCommandCandidates({
			...options,
			entry,
			...nextState,
		}),
	);
}

function descriptorCommandInfoPath(options: {
	commandName: string;
	segments: readonly string[];
	hiddenAncestorKeys: readonly string[];
	rootGroupDescription: string;
}): Pick<
	NsCommandCliInfo,
	"name" | "group" | "segments" | "groupDescription" | "hiddenAncestorKeys"
> {
	const rootGroup = options.segments[0];
	if (options.segments.length === 1 && rootGroup !== undefined) {
		return {
			name: options.commandName,
			group: rootGroup,
			groupDescription: options.rootGroupDescription,
			...optionalEntry("hiddenAncestorKeys", options.hiddenAncestorKeys),
		};
	}
	return {
		name: options.commandName,
		segments: [...options.segments, options.commandName],
		// The descriptor description labels the root group even when every command
		// nests deeper (for example a hidden exec group); help falls back to a
		// generated "NS <group> commands." string without it.
		...optionalEntry(
			"groupDescription",
			rootGroup === undefined ? undefined : options.rootGroupDescription,
		),
		...optionalEntry("hiddenAncestorKeys", options.hiddenAncestorKeys),
	};
}

async function loadPreinstalledCandidates(
	catalogLoader: PreinstalledNsCommandCatalogLoader | undefined,
	cwd: string,
): Promise<LoadedCatalogFragment> {
	const catalog =
		catalogLoader === undefined
			? { entries: [], extensionPackageNames: [], builtInPackageNames: [] }
			: await catalogLoader();
	const catalogContributions = preinstalledCatalogContributions(catalog.entries);
	const representedPackageNames = new Set(
		catalogContributions.map((contribution) => contribution.packageName),
	);
	const commandlessContributions = catalog.extensionPackageNames
		.filter((packageName) => !representedPackageNames.has(packageName))
		.map(
			(packageName): CatalogPackageContribution => ({
				contributionId: `preinstalled:catalog:${packageName}`,
				packageName,
				level: "preinstalled",
				commandKeys: [],
				commandMetadata: [],
				requiresExtensions: [],
				payload: [],
			}),
		);
	const catalogKeys = new Set(
		catalogContributions.flatMap((contribution) => contribution.commandKeys),
	);
	const sourceDevCandidates = await loadSourceDevPreinstalledCandidates(cwd, catalogKeys);
	return {
		diagnostics: sourceDevCandidates.diagnostics,
		contributions: [
			...catalogContributions,
			...commandlessContributions,
			...sourceDevCandidates.contributions,
		],
		builtInPackageNames: catalog.builtInPackageNames,
	};
}

async function loadSourceDevPreinstalledCandidates(
	cwd: string,
	catalogKeys: ReadonlySet<string>,
): Promise<LoadedCatalogFragment> {
	const packagesRoot = sourceDevWorkspacePackagesRoot(cwd);
	if (packagesRoot === undefined) return emptyLoadedCatalogFragment();
	const packageDirs = discoverWorkspacePackageDirs(packagesRoot);
	const diagnostics: ExtensionDiagnostic[] = [];
	const contributions: CatalogPackageContribution[] = [];
	for (const packageDir of packageDirs) {
		const descriptor = await loadSourceDevDescriptorCandidates({ cwd, packagesRoot, packageDir });
		diagnostics.push(...descriptor.diagnostics);
		contributions.push(
			...descriptor.contributions.map((contribution) => {
				const payload = contribution.payload.filter(
					(candidate) => !catalogKeys.has(commandKey(candidate)),
				);
				return { ...contribution, commandKeys: payload.map(commandKey), payload };
			}),
		);
	}
	return {
		diagnostics,
		contributions,
		builtInPackageNames: [],
	};
}

async function loadSourceDevDescriptorCandidates(options: {
	cwd: string;
	packagesRoot: string;
	packageDir: string;
}): Promise<LoadedCatalogFragment> {
	const loaded = await loadExtensionDescriptorFromPackageRoot({ packageRoot: options.packageDir });
	if (!loaded.ok) {
		if (
			loaded.error.type === "package-manifest-missing" ||
			loaded.error.type === "package-manifest-read-failed" ||
			loaded.error.type === "package-manifest-invalid" ||
			loaded.error.code === "extension_descriptor_export_missing"
		) {
			// Source-dev discovery is opportunistic; packages without usable descriptor metadata are ignored.
			return emptyLoadedCatalogFragment();
		}
		return emptyLoadedCatalogFragment([
			{
				severity: "error",
				code: loaded.error.code,
				message:
					loaded.error.type === "descriptor-import-failed"
						? `Failed to load source-dev ns extension descriptor ${loaded.error.path}.\n${loaded.error.causeMessage ?? loaded.error.message}`
						: loaded.error.message,
				path: loaded.error.path,
				sourceLevel: "preinstalled",
			},
		]);
	}
	const spec = relative(options.packagesRoot, options.packageDir);
	const contributionId = `preinstalled:source-dev:${resolve(options.packageDir)}`;
	const candidates = descriptorCommandCandidates({
		cwd: options.cwd,
		spec,
		packageDir: options.packageDir,
		descriptorPath: loaded.value.descriptorPath,
		descriptor: loaded.value.descriptor,
		sourceLevel: "preinstalled",
		sourceLabel: `source-dev descriptor ${spec}`,
		sourceKind: "package",
		packageName: loaded.value.packageName,
		contributionId,
	});
	return {
		diagnostics: [],
		builtInPackageNames: [],
		contributions: [
			{
				contributionId,
				packageName: loaded.value.packageName,
				level: "preinstalled",
				commandKeys: candidates.map(commandKey),
				commandMetadata: candidates.map(commandMetadata),
				requiresExtensions: loaded.value.descriptor.requiresExtensions ?? [],
				payload: candidates,
			},
		],
	};
}

function sourceDevWorkspacePackagesRoot(cwd: string): string | undefined {
	// This module lives at ts/packages/public/sdk/src/extensions/, so four hops reach
	// ts/packages — the root every disposition tree hangs off (ADR 0045).
	const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
	const checkoutRoot = resolve(packagesRoot, "..", "..");
	const sdkSourceDir = join(packagesRoot, "public", "sdk", "src");
	if (!existsSync(sdkSourceDir)) return undefined;
	return isPathInside(checkoutRoot, cwd) ? packagesRoot : undefined;
}

/**
 * Runaway-recursion backstop for the source-dev walk of `ts/packages` (symlink loops,
 * pathological nesting). It is not a structural limit on how deep a package may live:
 * owner nesting below a disposition root is free-form (ADR 0045), so raise this freely
 * rather than treating it as a layout rule.
 */
const MAX_SOURCE_DEV_PACKAGE_WALK_DEPTH = 12;

function discoverWorkspacePackageDirs(packagesRoot: string): readonly string[] {
	const packageDirs: string[] = [];
	collectPackageDirs({ root: packagesRoot, current: packagesRoot, depth: 0, packageDirs });
	return packageDirs.sort((left, right) => left.localeCompare(right));
}

function collectPackageDirs(options: {
	root: string;
	current: string;
	depth: number;
	packageDirs: string[];
}): void {
	if (options.depth > MAX_SOURCE_DEV_PACKAGE_WALK_DEPTH) return;
	const packageJsonPath = join(options.current, "package.json");
	if (options.current !== options.root && existsSync(packageJsonPath)) {
		options.packageDirs.push(options.current);
		return;
	}
	let entries;
	try {
		entries = readdirSync(options.current, { withFileTypes: true });
	} catch {
		// Source-dev package discovery is best-effort; unreadable subtrees cannot contribute commands.
		return;
	}
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (!entry.isDirectory() || entry.name === "node_modules") continue;
		collectPackageDirs({
			root: options.root,
			current: join(options.current, entry.name),
			depth: options.depth + 1,
			packageDirs: options.packageDirs,
		});
	}
}

function preinstalledCatalogContributions(
	entries: readonly PreinstalledNsCommandCatalogEntry[],
): readonly CatalogPackageContribution[] {
	const grouped = new Map<string, PreinstalledNsCommandCatalogEntry[]>();
	for (const entry of entries) {
		const contributionId =
			entry.contributionId ?? `preinstalled:legacy:${inferPreinstalledPackageName(entry)}`;
		const group = grouped.get(contributionId);
		if (group === undefined) grouped.set(contributionId, [entry]);
		else group.push(entry);
	}
	return [...grouped].map(([contributionId, group]) => {
		const first = group[0];
		if (first === undefined)
			throw new Error("Preinstalled extension contribution must not be empty.");
		const candidates = group
			.map(preinstalledCandidateForCatalogEntry)
			.map(withDefaultPreinstalledHelpGroup);
		return {
			contributionId,
			packageName: first.packageName ?? inferPreinstalledPackageName(first),
			level: "preinstalled",
			commandKeys: candidates.map(commandKey),
			commandMetadata: candidates.map(commandMetadata),
			requiresExtensions: first.requiresExtensions ?? [],
			payload: candidates,
		};
	});
}

function commandMetadata(candidate: ExtensionCommandCandidate): {
	readonly name: string;
	readonly group?: string;
	readonly path?: readonly string[];
} {
	return {
		name: candidate.name,
		...optionalEntry("group", candidate.group),
		path: commandSegments(candidate),
	};
}

function inferPreinstalledPackageName(entry: PreinstalledNsCommandCatalogEntry): string {
	const displayPath = preinstalledCatalogEntryDisplayPath(entry);
	const match = /^(@[^/]+\/[^/]+|[^/]+)/.exec(displayPath);
	return match?.[1] ?? displayPath;
}

function preinstalledCandidateForCatalogEntry(
	entry: PreinstalledNsCommandCatalogEntry,
): ExternalNsCommandCandidate {
	const displayPath = preinstalledCatalogEntryDisplayPath(entry);
	return {
		...preinstalledCatalogEntryCommandInfo(entry),
		moduleReference: preinstalledCatalogEntryModuleReference(entry),
		hasStaticCommandInfo: entry.hasStaticCommandInfo ?? true,
		...optionalEntry("packageName", entry.packageName),
		...optionalEntry("contributionId", entry.contributionId),
		source: {
			level: "preinstalled",
			label: `preinstalled package ${displayPath}`,
			path: displayPath,
		},
	};
}

function preinstalledCatalogEntryModuleReference(
	entry: PreinstalledNsCommandCatalogEntry,
): NsCommandModuleReference {
	if (entry.load !== undefined) return loadedModuleReference(entry.displayPath, entry.load);
	return packageModuleReference(entry.moduleSpecifier);
}

function preinstalledCatalogEntryDisplayPath(entry: PreinstalledNsCommandCatalogEntry): string {
	if (entry.load !== undefined) return entry.displayPath;
	return entry.moduleSpecifier;
}

function preinstalledCatalogEntryCommandInfo(
	entry: PreinstalledNsCommandCatalogEntry,
): NsCommandCliInfo {
	return toCommandCliInfo({
		...entry,
		...optionalEntries({
			segments: entry.path,
			hiddenAncestorKeys: entry.hiddenAncestorKeys,
		}),
	});
}

function emptyLoadedCatalogFragment(
	diagnostics: readonly ExtensionDiagnostic[] = [],
): LoadedCatalogFragment {
	return {
		diagnostics,
		contributions: [],
		builtInPackageNames: [],
	};
}

function withDefaultPreinstalledHelpGroup(
	candidate: ExtensionCommandCandidate,
): ExtensionCommandCandidate {
	if (candidate.helpGroup !== undefined) return candidate;
	return { ...candidate, helpGroup: NS_EXTENSION_HELP_GROUP };
}

function sourceLevelRank(level: ExtensionSourceLevel): number {
	const rank = ORDERED_SOURCE_LEVELS.indexOf(level);
	if (rank === -1) {
		throw new Error(`Missing ns extension source-level order for ${level}.`);
	}
	return rank;
}

function isBuiltInCandidate(
	candidate: ExtensionCommandCandidate,
): candidate is BuiltInNsCommandCandidate {
	return candidate.source.level === "built-in";
}

function fromLoadDiagnostic(
	diagnostic: ExtensionLoadDiagnostic,
	sourceLevel: ExtensionSourceLevel,
	commandName: string,
): ExtensionErrorDiagnostic {
	return { ...diagnostic, sourceLevel, commandName };
}

function candidateDiagnosticPath(candidate: ExtensionCommandCandidate): string {
	if (isBuiltInCandidate(candidate)) return formatSource(candidate.source);
	return moduleReferenceDisplay(candidate.moduleReference);
}

function formatSource(source: ExtensionSourceInfo): string {
	return source.path === undefined ? source.label : `${source.label} (${source.path})`;
}
