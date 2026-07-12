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
	type NsCommandSourceLevel,
} from "./command-registry.ts";
import { NS_COMMAND_NAME_PATTERN, NS_COMMAND_NAME_RULE } from "../sdk/command-name.ts";
import { nextDescriptorTraversalState } from "./descriptor-traversal.ts";
import { loadDeclaredExtensionDescriptors } from "./declared-descriptors.ts";
import { loadExtensionDescriptorFromPackageRoot } from "../project-config/extension-package-descriptor.ts";
import { loadNsExtensionContribution, type ExtensionLoadDiagnostic } from "./loader.ts";
import {
	loadedModuleReference,
	moduleReferenceDisplay,
	packageModuleReference,
	type NsCommandModuleLoader,
	type NsCommandModuleReference,
} from "./module-reference.ts";
import {
	isPathInside,
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

export type ExtensionSourceLevel = NsCommandSourceLevel;
export type ExtensionSourceInfo = NsCommandSourceInfo;

export interface NsCommandCatalog {
	candidates: ReadonlyMap<string, ExtensionCommandCandidate>;
	commandInfos: readonly NsCommandCliInfo[];
	diagnostics: readonly ExtensionDiagnostic[];
}

export type ExtensionCommandCandidate = BuiltInNsCommandCandidate | ExternalNsCommandCandidate;

export interface ExternalNsCommandCandidate extends NsCommandCandidate {
	moduleReference: NsCommandModuleReference;
	entryPath?: string;
	hasStaticCommandInfo: boolean;
	descriptorEntry?: ExtensionCommandEntry;
}

export type ExtensionDiagnostic = ExtensionErrorDiagnostic | ExtensionOverrideDiagnostic;

export interface ExtensionErrorDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path?: string;
	sourceLevel?: ExtensionSourceLevel;
	commandName?: string;
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
	| { ok: true; command: DescriptorCommand; source: ExtensionSourceInfo; path: NsCommandPath }
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
}

export interface PreinstalledNsCommandPackageCatalogEntry extends PreinstalledNsCommandCatalogEntryBase {
	readonly moduleSpecifier: string;
	readonly load?: undefined;
}

export interface PreinstalledNsCommandLoadedCatalogEntry extends PreinstalledNsCommandCatalogEntryBase {
	readonly displayPath: string;
	readonly load: NsCommandModuleLoader;
}

export type PreinstalledNsCommandCatalogLoader = () =>
	| readonly PreinstalledNsCommandCatalogEntry[]
	| Promise<readonly PreinstalledNsCommandCatalogEntry[]>;

export interface LoadNsCommandCatalogOptions {
	cwd: string;
	homeDir?: string;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	preinstalledCommandCatalog?: PreinstalledNsCommandCatalogLoader;
}

const ORDERED_SOURCE_LEVELS = [
	"built-in",
	"preinstalled",
	"project",
] as const satisfies readonly ExtensionSourceLevel[];

export async function loadNsCommandCatalog(
	options: LoadNsCommandCatalogOptions,
): Promise<NsCommandCatalog> {
	const diagnostics: ExtensionDiagnostic[] = [];
	const builtInCandidates = listBuiltInNsCommandCandidates();
	const orderedSources: Array<{
		level: ExtensionSourceLevel;
		label: string;
		candidates: readonly ExtensionCommandCandidate[];
	}> = [{ level: "built-in", label: "built-in", candidates: builtInCandidates }];
	const preinstalledCandidates = await loadPreinstalledCandidates(
		options.preinstalledCommandCatalog,
		options.cwd,
	);
	diagnostics.push(...preinstalledCandidates.diagnostics);
	orderedSources.push({
		level: "preinstalled",
		label: "preinstalled extension metadata",
		candidates: preinstalledCandidates.candidates,
	});
	const descriptorProjectCandidates = await loadProjectDescriptorCandidates(options.cwd);
	diagnostics.push(...descriptorProjectCandidates.diagnostics);
	orderedSources.push({
		level: "project",
		label: "ns.toml descriptor extensions",
		candidates: descriptorProjectCandidates.candidates,
	});

	const merged = new Map<string, ExtensionCommandCandidate>();
	for (const source of orderedSources) {
		const validation = validateSourceCandidates(source.level, source.label, source.candidates);
		diagnostics.push(...validation.diagnostics);
		for (const candidate of validation.candidates) {
			const key = commandKey(candidate);
			const existing = merged.get(key);
			if (existing !== undefined) {
				diagnostics.push({
					severity: "info",
					code: "extension_command_override",
					message: `ns command ${key} from ${formatSource(candidate.source)} overrides ${formatSource(existing.source)}.`,
					commandName: key,
					overriddenSource: existing.source,
					overridingSource: candidate.source,
				});
			}
			merged.set(key, candidate);
		}
	}

	const sortedCandidates = [...merged.values()].sort((left, right) =>
		commandKey(left).localeCompare(commandKey(right)),
	);
	const collisionFilter = filterGroupCommandCollisions(sortedCandidates);
	diagnostics.push(...collisionFilter.diagnostics);
	const finalCandidates = collisionFilter.candidates;
	return {
		candidates: new Map(finalCandidates.map((candidate) => [commandKey(candidate), candidate])),
		commandInfos: finalCandidates.map(toCommandCliInfo),
		diagnostics,
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
		| { command: DescriptorCommand; source: ExtensionSourceInfo; path: NsCommandPath }
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
		return { fatal: [], warnings: errorDiagnostics };
	}

	const fatal: ExtensionErrorDiagnostic[] = [];
	const warnings: ExtensionErrorDiagnostic[] = [];
	for (const diagnostic of errorDiagnostics) {
		if (diagnostic.commandName !== options.requestedCommandName) {
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

async function loadProjectDescriptorCandidates(cwd: string): Promise<{
	diagnostics: readonly ExtensionDiagnostic[];
	candidates: readonly ExtensionCommandCandidate[];
}> {
	const declared = readDeclaredExtensionSpecs(cwd);
	if (!declared.ok) return { diagnostics: [declared.diagnostic], candidates: [] };
	const loaded = await loadDeclaredExtensionDescriptors({ repoRoot: cwd, specs: declared.specs });
	return {
		diagnostics: loaded.diagnostics.map((diagnostic) =>
			projectErrorDiagnostic(
				diagnostic.code,
				diagnostic.message,
				diagnostic.path ?? join(cwd, "ns.toml"),
			),
		),
		candidates: loaded.descriptors.flatMap((record) =>
			descriptorCommandCandidates({
				cwd,
				spec: record.spec,
				packageDir: record.moduleRoot,
				descriptorPath: record.descriptorPath,
				descriptor: record.descriptor,
				sourceLevel: "project",
				sourceLabel: `ns.toml descriptor ${record.spec}`,
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

function descriptorCommandCandidates(options: {
	cwd: string;
	spec: string;
	packageDir: string;
	descriptorPath: string;
	descriptor: ExtensionDescriptor;
	sourceLevel: ExtensionSourceLevel;
	sourceLabel: string;
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
	const nextState = nextDescriptorTraversalState(options.entry, options);
	return options.entry.entries.flatMap((entry) =>
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
		...optionalEntry("hiddenAncestorKeys", options.hiddenAncestorKeys),
	};
}

async function loadPreinstalledCandidates(
	catalogLoader: PreinstalledNsCommandCatalogLoader | undefined,
	cwd: string,
): Promise<{
	diagnostics: readonly ExtensionDiagnostic[];
	candidates: readonly ExtensionCommandCandidate[];
}> {
	const catalogEntries = catalogLoader === undefined ? [] : await catalogLoader();
	const catalogCandidates = catalogEntries.map(preinstalledCandidateForCatalogEntry);
	const sourceDevCandidates = await loadSourceDevPreinstalledCandidates(
		cwd,
		new Set(catalogCandidates.map((candidate) => commandKey(candidate))),
	);
	return {
		diagnostics: sourceDevCandidates.diagnostics,
		candidates: [...catalogCandidates, ...sourceDevCandidates.candidates],
	};
}

async function loadSourceDevPreinstalledCandidates(
	cwd: string,
	catalogKeys: ReadonlySet<string>,
): Promise<{
	diagnostics: readonly ExtensionDiagnostic[];
	candidates: readonly ExtensionCommandCandidate[];
}> {
	const packagesRoot = sourceDevWorkspacePackagesRoot(cwd);
	if (packagesRoot === undefined) return { diagnostics: [], candidates: [] };
	const packageDirs = discoverWorkspacePackageDirs(packagesRoot);
	const diagnostics: ExtensionDiagnostic[] = [];
	const candidates: ExtensionCommandCandidate[] = [];
	for (const packageDir of packageDirs) {
		const descriptor = await loadSourceDevDescriptorCandidates({ cwd, packagesRoot, packageDir });
		diagnostics.push(...descriptor.diagnostics);
		candidates.push(
			...descriptor.candidates.filter((candidate) => !catalogKeys.has(commandKey(candidate))),
		);
	}
	return { diagnostics, candidates };
}

async function loadSourceDevDescriptorCandidates(options: {
	cwd: string;
	packagesRoot: string;
	packageDir: string;
}): Promise<{
	diagnostics: readonly ExtensionDiagnostic[];
	candidates: readonly ExtensionCommandCandidate[];
}> {
	const loaded = await loadExtensionDescriptorFromPackageRoot({ packageRoot: options.packageDir });
	if (!loaded.ok) {
		if (
			loaded.error.type === "package-manifest-missing" ||
			loaded.error.type === "package-manifest-read-failed" ||
			loaded.error.type === "package-manifest-invalid" ||
			loaded.error.code === "extension_descriptor_export_missing"
		) {
			// Source-dev discovery is opportunistic; packages without usable descriptor metadata are ignored.
			return { diagnostics: [], candidates: [] };
		}
		return {
			diagnostics: [
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
			],
			candidates: [],
		};
	}
	const spec = relative(options.packagesRoot, options.packageDir);
	return {
		diagnostics: [],
		candidates: descriptorCommandCandidates({
			cwd: options.cwd,
			spec,
			packageDir: options.packageDir,
			descriptorPath: loaded.value.descriptorPath,
			descriptor: loaded.value.descriptor,
			sourceLevel: "preinstalled",
			sourceLabel: `source-dev descriptor ${spec}`,
		}),
	};
}

function sourceDevWorkspacePackagesRoot(cwd: string): string | undefined {
	const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
	const checkoutRoot = resolve(packagesRoot, "..", "..");
	const kernelSourceDir = join(packagesRoot, "sdk", "src");
	if (!existsSync(kernelSourceDir)) return undefined;
	return isPathInside(checkoutRoot, cwd) ? packagesRoot : undefined;
}

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
	if (options.depth > 3) return;
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

function preinstalledCandidateForCatalogEntry(
	entry: PreinstalledNsCommandCatalogEntry,
): ExternalNsCommandCandidate {
	const displayPath = preinstalledCatalogEntryDisplayPath(entry);
	return {
		...preinstalledCatalogEntryCommandInfo(entry),
		moduleReference: preinstalledCatalogEntryModuleReference(entry),
		hasStaticCommandInfo: entry.hasStaticCommandInfo ?? true,
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
		...(entry.path === undefined ? {} : { segments: entry.path }),
		...(entry.hiddenAncestorKeys === undefined
			? {}
			: { hiddenAncestorKeys: entry.hiddenAncestorKeys }),
	});
}

function validateSourceCandidates(
	level: ExtensionSourceLevel,
	sourceLabel: string,
	candidates: readonly ExtensionCommandCandidate[],
): {
	candidates: readonly ExtensionCommandCandidate[];
	diagnostics: readonly ExtensionDiagnostic[];
} {
	const diagnostics: ExtensionDiagnostic[] = [];
	const validated: ExtensionCommandCandidate[] = [];
	for (const candidate of candidates) {
		if (!NS_COMMAND_NAME_PATTERN.test(candidate.name)) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_name_invalid",
				message: `Invalid ns command candidate from ${formatSource(candidate.source)}: command name must match ${NS_COMMAND_NAME_RULE}.`,
				...(candidate.source.path === undefined ? {} : { path: candidate.source.path }),
				sourceLevel: candidate.source.level,
				commandName: commandKey(candidate),
			});
			continue;
		}
		if (candidate.group !== undefined && !NS_COMMAND_NAME_PATTERN.test(candidate.group)) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_group_invalid",
				message: `Invalid ns command candidate from ${formatSource(candidate.source)}: command group must match ${NS_COMMAND_NAME_RULE}.`,
				...(candidate.source.path === undefined ? {} : { path: candidate.source.path }),
				sourceLevel: candidate.source.level,
				commandName: commandKey(candidate),
			});
			continue;
		}
		if (commandSegments(candidate).some((segment) => !NS_COMMAND_NAME_PATTERN.test(segment))) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_path_invalid",
				message: `Invalid ns command candidate from ${formatSource(candidate.source)}: command path segments must match ${NS_COMMAND_NAME_RULE}.`,
				...(candidate.source.path === undefined ? {} : { path: candidate.source.path }),
				sourceLevel: candidate.source.level,
				commandName: commandKey(candidate),
			});
			continue;
		}
		validated.push(candidate);
	}

	const candidatesByName = new Map<string, readonly ExtensionCommandCandidate[]>();
	for (const candidate of validated) {
		const key = commandKey(candidate);
		const existing = candidatesByName.get(key) ?? [];
		candidatesByName.set(key, [...existing, candidate]);
	}

	const duplicateNames = new Set(
		[...candidatesByName.entries()]
			.filter(([, matches]) => matches.length > 1)
			.map(([name]) => name),
	);
	for (const name of duplicateNames) {
		const matches = candidatesByName.get(name) ?? [];
		diagnostics.push({
			severity: "error",
			code: "extension_command_duplicate_in_level",
			message: `Duplicate ns command ${name} within ${level} extension source ${sourceLabel}: ${matches.map((match) => formatSource(match.source)).join(", ")}.`,
			sourceLevel: level,
			commandName: name,
		});
	}
	return {
		candidates: validated.filter((candidate) => !duplicateNames.has(commandKey(candidate))),
		diagnostics,
	};
}

function filterGroupCommandCollisions(candidates: readonly ExtensionCommandCandidate[]): {
	candidates: readonly ExtensionCommandCandidate[];
	diagnostics: readonly ExtensionErrorDiagnostic[];
} {
	const topLevelByName = new Map<string, ExtensionCommandCandidate>();
	for (const candidate of candidates) {
		const segments = commandSegments(candidate);
		if (segments.length !== 1) continue;
		const name = segments[0];
		if (name === undefined) continue;
		topLevelByName.set(name, candidate);
	}
	if (topLevelByName.size === 0) {
		return { candidates, diagnostics: [] };
	}

	const collidingGroups = new Set<string>();
	const diagnostics: ExtensionErrorDiagnostic[] = [];
	for (const candidate of candidates) {
		const segments = commandSegments(candidate);
		if (segments.length < 2) continue;
		const topSegment = segments[0];
		if (topSegment === undefined) continue;
		const topLevel = topLevelByName.get(topSegment);
		if (topLevel === undefined) continue;
		collidingGroups.add(topSegment);
		diagnostics.push({
			severity: "error",
			code: "extension_command_group_collision",
			message: `ns command ${commandKey(candidate)} from ${formatSource(candidate.source)} cannot load because top-level command ${topSegment} from ${formatSource(topLevel.source)} already exists.`,
			path: candidateDiagnosticPath(candidate),
			sourceLevel: candidate.source.level,
			commandName: commandKey(candidate),
		});
	}
	if (collidingGroups.size === 0) {
		return { candidates, diagnostics: [] };
	}

	return {
		candidates: candidates.filter((candidate) => {
			const segments = commandSegments(candidate);
			const topSegment = segments[0];
			return segments.length < 2 || topSegment === undefined || !collidingGroups.has(topSegment);
		}),
		diagnostics,
	};
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
