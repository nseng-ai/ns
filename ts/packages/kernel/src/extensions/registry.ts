import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
	commandInfoForLoadedCommand,
	commandKey,
	toCommandCliInfo,
	commandPathMatches,
	commandSegments,
	listBuiltInNsCommandCandidates,
	validateNsExtensionContribution,
	type BuiltInNsCommandCandidate,
	type NsCommandCandidate,
	type NsCommandCliInfo,
	type NsCommandPath,
	type NsCommandSourceInfo,
	type NsCommandSourceLevel,
} from "./command-registry.ts";
import { NS_COMMAND_NAME_PATTERN, NS_COMMAND_NAME_RULE } from "../sdk/command-name.ts";
import {
	discoverExtensionsInRoot,
	discoverNsPackageCommands,
	type DiscoveredExtensionCommand,
	type ExtensionDiscoveryDiagnostic,
} from "./discovery.ts";
import { loadNsExtensionContribution, type ExtensionLoadDiagnostic } from "./loader.ts";
import {
	fileModuleReference,
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
import { mergeXdgHomeEnv, requireXdgPath, resolveNsXdgPath } from "@nseng-ai/foundation/xdg-path";
import type { NsCommand } from "../sdk/index.ts";

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
	| { ok: true; command: NsCommand; source: ExtensionSourceInfo; path: NsCommandPath }
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
	/** User home used only as HOME while resolving XDG-shaped global extension roots. */
	xdgHomeDir?: string;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	preinstalledCommandCatalog?: PreinstalledNsCommandCatalogLoader;
}

const ORDERED_SOURCE_LEVELS = [
	"built-in",
	"preinstalled",
	"global",
	"project",
] as const satisfies readonly ExtensionSourceLevel[];

export async function loadNsCommandCatalog(
	options: LoadNsCommandCatalogOptions,
): Promise<NsCommandCatalog> {
	const diagnostics: ExtensionDiagnostic[] = [];
	const builtInCandidates = listBuiltInNsCommandCandidates();
	const env = catalogEnv(options);
	const globalRoots = [
		requireXdgPath(resolveNsXdgPath({ kind: "data", env, segments: ["extensions"] })),
	];
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
	for (const rootDir of uniquePaths(globalRoots)) {
		const loaded = loadRootCandidates({ level: "global", rootDir });
		diagnostics.push(...loaded.diagnostics);
		orderedSources.push({ level: "global", label: rootDir, candidates: loaded.candidates });
	}
	const projectCandidates = loadRootCandidates({
		level: "project",
		rootDir: join(options.cwd, ".ns", "extensions"),
	});
	diagnostics.push(...projectCandidates.diagnostics);
	orderedSources.push({
		level: "project",
		label: join(options.cwd, ".ns", "extensions"),
		candidates: projectCandidates.candidates,
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
	const validation = validateNsExtensionContribution(
		loaded.defaultExport,
		candidate,
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

export async function loadListingCommandInfos(catalog: NsCommandCatalog): Promise<{
	commandInfos: readonly NsCommandCliInfo[];
	diagnostics: readonly ExtensionErrorDiagnostic[];
}> {
	const loadedInfos = await Promise.all(
		[...catalog.candidates.values()].map(async (candidate) => {
			if (isBuiltInCandidate(candidate)) {
				return { commandInfo: toCommandCliInfo(candidate), diagnostic: undefined };
			}
			if (candidate.moduleReference.type === "package" || candidate.hasStaticCommandInfo) {
				return { commandInfo: toCommandCliInfo(candidate), diagnostic: undefined };
			}
			const loaded = await loadSelectedNsCommand(candidate);
			if (!loaded.ok) {
				return { commandInfo: toCommandCliInfo(candidate), diagnostic: loaded.diagnostic };
			}
			return {
				commandInfo: commandInfoForLoadedCommand(loaded.command, loaded.source.level, loaded.path),
				diagnostic: undefined,
			};
		}),
	);
	return {
		commandInfos: loadedInfos.map((loaded) => loaded.commandInfo),
		diagnostics: loadedInfos.flatMap((loaded) =>
			loaded.diagnostic === undefined ? [] : [loaded.diagnostic],
		),
	};
}

export function commandInfosForSelectedCommand(
	commandInfos: readonly NsCommandCliInfo[],
	loaded: { command: NsCommand; source: ExtensionSourceInfo; path: NsCommandPath } | undefined,
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

function loadRootCandidates(options: { level: "global" | "project"; rootDir: string }): {
	diagnostics: readonly ExtensionDiagnostic[];
	candidates: readonly ExtensionCommandCandidate[];
} {
	const discovered = discoverExtensionsInRoot(options.rootDir);
	return {
		diagnostics: discovered.diagnostics.map((diagnostic) =>
			fromDiscoveryDiagnostic(diagnostic, options.level),
		),
		candidates: discovered.commands.map((command) =>
			discoveredCommandCandidateForLevel(command, options.level),
		),
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
	const sourceDevCandidates = loadSourceDevPreinstalledCandidates(
		cwd,
		new Set(catalogCandidates.map((candidate) => commandKey(candidate))),
	);
	return {
		diagnostics: sourceDevCandidates.diagnostics,
		candidates: [...catalogCandidates, ...sourceDevCandidates.candidates],
	};
}

function loadSourceDevPreinstalledCandidates(
	cwd: string,
	catalogKeys: ReadonlySet<string>,
): {
	diagnostics: readonly ExtensionDiagnostic[];
	candidates: readonly ExtensionCommandCandidate[];
} {
	const packagesRoot = sourceDevWorkspacePackagesRoot(cwd);
	if (packagesRoot === undefined) return { diagnostics: [], candidates: [] };
	const packageDirs = discoverWorkspacePackageDirs(packagesRoot);
	const diagnostics: ExtensionDiagnostic[] = [];
	const candidates: ExtensionCommandCandidate[] = [];
	for (const packageDir of packageDirs) {
		const discovered = discoverNsPackageCommands(packagesRoot, packageDir);
		diagnostics.push(
			...discovered.diagnostics.map((diagnostic) =>
				fromDiscoveryDiagnostic(diagnostic, "preinstalled"),
			),
		);
		candidates.push(
			...discovered.commands
				.filter((command) => !catalogKeys.has(commandKey(command)))
				.map(sourceDevDiscoveredCommandCandidate),
		);
	}
	return { diagnostics, candidates };
}

function sourceDevWorkspacePackagesRoot(cwd: string): string | undefined {
	const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
	const checkoutRoot = resolve(packagesRoot, "..", "..");
	const kernelSourceDir = join(packagesRoot, "kernel", "src");
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
		hasStaticCommandInfo: true,
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
	});
}

function sourceDevDiscoveredCommandCandidate(
	command: DiscoveredExtensionCommand,
): ExternalNsCommandCandidate {
	return discoveredCommandCandidate({
		command,
		level: "preinstalled",
		label: `source-dev package ${command.displayPath}`,
	});
}

function discoveredCommandCandidateForLevel(
	command: DiscoveredExtensionCommand,
	level: "global" | "project",
): ExternalNsCommandCandidate {
	return discoveredCommandCandidate({
		command,
		level,
		label: command.displayPath,
	});
}

function discoveredCommandCandidate(options: {
	command: DiscoveredExtensionCommand;
	level: ExtensionSourceLevel;
	label: string;
}): ExternalNsCommandCandidate {
	return {
		...toCommandCliInfo(options.command),
		moduleReference:
			options.command.moduleReference ?? fileModuleReference(options.command.entryPath),
		entryPath: options.command.entryPath,
		hasStaticCommandInfo: options.command.hasStaticCommandInfo,
		source: {
			level: options.level,
			label: options.label,
			path: options.command.entryPath,
		},
	};
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

function catalogEnv(options: LoadNsCommandCatalogOptions): Record<string, string | undefined> {
	return mergeXdgHomeEnv({
		baseEnv: process.env,
		...optionalEntry("env", options.env),
		...optionalEntry("xdgHomeDir", options.xdgHomeDir),
	});
}

function uniquePaths(paths: readonly string[]): readonly string[] {
	return [...new Set(paths)];
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

function fromDiscoveryDiagnostic(
	diagnostic: ExtensionDiscoveryDiagnostic,
	sourceLevel: ExtensionSourceLevel,
): ExtensionErrorDiagnostic {
	return { ...diagnostic, sourceLevel };
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
