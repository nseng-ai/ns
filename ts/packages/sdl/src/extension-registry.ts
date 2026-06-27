import process from "node:process";
import { join } from "node:path";

import { requireXdgPath, resolveSdlXdgPath } from "@sdl/core/xdg";

import {
	SDL_COMMAND_NAME_PATTERN,
	SDL_COMMAND_NAME_RULE,
	commandInfoForLoadedCommand,
	commandKey,
	commandPathMatches,
	listBuiltInSdlCommandCandidates,
	validateSdlExtensionContribution,
	type BuiltInSdlCommandCandidate,
	type SdlCommandCandidate,
	type SdlCommandCliInfo,
	type SdlCommandPath,
	type SdlCommandSourceInfo,
	type SdlCommandSourceLevel,
} from "./command-registry.ts";
import {
	discoverExtensionsInRoot,
	type DiscoveredExtensionCommand,
	type DiscoveredExtensionCommandKind,
	type ExtensionDiscoveryDiagnostic,
} from "./extension-discovery.ts";
import { loadSdlExtensionContribution, type ExtensionLoadDiagnostic } from "./extension-loader.ts";
import type { SdlCommand } from "sdl-sdk";

export type ExtensionSourceLevel = SdlCommandSourceLevel;
export type ExtensionSourceInfo = SdlCommandSourceInfo;

export interface SdlCommandCatalog {
	candidates: ReadonlyMap<string, ExtensionCommandCandidate>;
	commandInfos: readonly SdlCommandCliInfo[];
	diagnostics: readonly ExtensionDiagnostic[];
}

export type ExtensionCommandCandidate = BuiltInSdlCommandCandidate | ExternalSdlCommandCandidate;

export interface ExternalSdlCommandCandidate extends SdlCommandCandidate {
	entryPath: string;
	kind: DiscoveredExtensionCommandKind;
}

export type ExtensionDiagnostic = ExtensionErrorDiagnostic | ExtensionOverrideDiagnostic;

export interface ExtensionErrorDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path?: string | undefined;
	sourceLevel?: ExtensionSourceLevel | undefined;
	commandName?: string | undefined;
}

export interface ExtensionOverrideDiagnostic {
	severity: "info";
	code: "extension_command_override";
	message: string;
	commandName: string;
	overriddenSource: ExtensionSourceInfo;
	overridingSource: ExtensionSourceInfo;
}

export type SelectedSdlCommandLoadResult =
	| { ok: true; command: SdlCommand; source: ExtensionSourceInfo; path: SdlCommandPath }
	| { ok: false; diagnostic: ExtensionErrorDiagnostic };

export interface DiagnosticClassification {
	fatal: readonly ExtensionErrorDiagnostic[];
	warnings: readonly ExtensionErrorDiagnostic[];
}

interface LoadSdlCommandCatalogOptions {
	cwd: string;
	homeDir?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
}

const ORDERED_SOURCE_LEVELS = [
	"built-in",
	"global",
	"project",
] as const satisfies readonly ExtensionSourceLevel[];

export async function loadSdlCommandCatalog(
	options: LoadSdlCommandCatalogOptions,
): Promise<SdlCommandCatalog> {
	const diagnostics: ExtensionDiagnostic[] = [];
	const builtInCandidates = listBuiltInSdlCommandCandidates();
	const env = catalogEnv(options);
	const globalRoots = [
		requireXdgPath(resolveSdlXdgPath({ kind: "data", env, segments: ["extensions"] })),
	];
	const orderedSources: Array<{
		level: ExtensionSourceLevel;
		label: string;
		candidates: readonly ExtensionCommandCandidate[];
	}> = [{ level: "built-in", label: "built-in", candidates: builtInCandidates }];
	for (const rootDir of uniquePaths(globalRoots)) {
		const loaded = loadRootCandidates({ level: "global", rootDir });
		diagnostics.push(...loaded.diagnostics);
		orderedSources.push({ level: "global", label: rootDir, candidates: loaded.candidates });
	}
	const projectCandidates = loadRootCandidates({
		level: "project",
		rootDir: join(options.cwd, ".sdl", "extensions"),
	});
	diagnostics.push(...projectCandidates.diagnostics);
	orderedSources.push({
		level: "project",
		label: join(options.cwd, ".sdl", "extensions"),
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
					message: `SDL command ${key} from ${formatSource(candidate.source)} overrides ${formatSource(existing.source)}.`,
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
		commandInfos: finalCandidates.map((candidate) => ({
			...(candidate.group === undefined ? {} : { group: candidate.group }),
			name: candidate.name,
			description: candidate.description,
			fullDescription: candidate.fullDescription,
		})),
		diagnostics,
	};
}

export async function loadSelectedSdlCommand(
	candidate: ExtensionCommandCandidate,
): Promise<SelectedSdlCommandLoadResult> {
	if (isBuiltInCandidate(candidate)) {
		return { ok: true, command: candidate.command, source: candidate.source, path: candidate };
	}

	const loaded = await loadSdlExtensionContribution(candidate.entryPath);
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
	const validation = validateSdlExtensionContribution(
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
				path: candidate.entryPath,
				sourceLevel: candidate.source.level,
				commandName: commandKey(candidate),
			},
		};
	}
	return { ok: true, command: validation.command, source: candidate.source, path: candidate };
}

export async function loadListingCommandInfos(catalog: SdlCommandCatalog): Promise<{
	commandInfos: readonly SdlCommandCliInfo[];
	diagnostics: readonly ExtensionErrorDiagnostic[];
}> {
	const loadedInfos = await Promise.all(
		[...catalog.candidates.values()].map(async (candidate) => {
			if (isBuiltInCandidate(candidate) || candidate.kind === "package") {
				return { commandInfo: staticCommandInfo(candidate), diagnostic: undefined };
			}
			const loaded = await loadSelectedSdlCommand(candidate);
			if (!loaded.ok) {
				return { commandInfo: staticCommandInfo(candidate), diagnostic: loaded.diagnostic };
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
	commandInfos: readonly SdlCommandCliInfo[],
	loaded: { command: SdlCommand; source: ExtensionSourceInfo; path: SdlCommandPath } | undefined,
): readonly SdlCommandCliInfo[] {
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
	options: { prefix?: string | undefined } = {},
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
			externalCandidateForLevel(command, options.level),
		),
	};
}

function externalCandidateForLevel(
	command: DiscoveredExtensionCommand,
	level: "global" | "project",
): ExternalSdlCommandCandidate {
	return {
		...(command.group === undefined ? {} : { group: command.group }),
		name: command.name,
		description: command.description,
		fullDescription: command.fullDescription,
		entryPath: command.entryPath,
		kind: command.kind,
		source: { level, label: command.displayPath, path: command.entryPath },
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
		if (!SDL_COMMAND_NAME_PATTERN.test(candidate.name)) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_name_invalid",
				message: `Invalid SDL command candidate from ${formatSource(candidate.source)}: command name must match ${SDL_COMMAND_NAME_RULE}.`,
				...(candidate.source.path === undefined ? {} : { path: candidate.source.path }),
				sourceLevel: candidate.source.level,
				commandName: commandKey(candidate),
			});
			continue;
		}
		if (candidate.group !== undefined && !SDL_COMMAND_NAME_PATTERN.test(candidate.group)) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_group_invalid",
				message: `Invalid SDL command candidate from ${formatSource(candidate.source)}: command group must match ${SDL_COMMAND_NAME_RULE}.`,
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
			message: `Duplicate SDL command ${name} within ${level} extension source ${sourceLabel}: ${matches.map((match) => formatSource(match.source)).join(", ")}.`,
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
		if (candidate.group !== undefined) continue;
		topLevelByName.set(candidate.name, candidate);
	}
	if (topLevelByName.size === 0) {
		return { candidates, diagnostics: [] };
	}

	const collidingGroups = new Set<string>();
	const diagnostics: ExtensionErrorDiagnostic[] = [];
	for (const candidate of candidates) {
		if (candidate.group === undefined) continue;
		const topLevel = topLevelByName.get(candidate.group);
		if (topLevel === undefined) continue;
		collidingGroups.add(candidate.group);
		diagnostics.push({
			severity: "error",
			code: "extension_command_group_collision",
			message: `SDL command ${commandKey(candidate)} from ${formatSource(candidate.source)} cannot load because top-level command ${candidate.group} from ${formatSource(topLevel.source)} already exists.`,
			...(candidate.entryPath === undefined ? {} : { path: candidate.entryPath }),
			sourceLevel: candidate.source.level,
			commandName: commandKey(candidate),
		});
	}
	if (collidingGroups.size === 0) {
		return { candidates, diagnostics: [] };
	}

	return {
		candidates: candidates.filter(
			(candidate) => candidate.group === undefined || !collidingGroups.has(candidate.group),
		),
		diagnostics,
	};
}

function catalogEnv(options: LoadSdlCommandCatalogOptions): Record<string, string | undefined> {
	return {
		...process.env,
		...(options.env ?? {}),
		...(options.homeDir === undefined ? {} : { HOME: options.homeDir }),
	};
}

function uniquePaths(paths: readonly string[]): readonly string[] {
	return [...new Set(paths)];
}

function sourceLevelRank(level: ExtensionSourceLevel): number {
	const rank = ORDERED_SOURCE_LEVELS.indexOf(level);
	if (rank === -1) {
		throw new Error(`Missing SDL extension source-level order for ${level}.`);
	}
	return rank;
}

function staticCommandInfo(candidate: ExtensionCommandCandidate): SdlCommandCliInfo {
	return {
		...(candidate.group === undefined ? {} : { group: candidate.group }),
		name: candidate.name,
		description: candidate.description,
		fullDescription: candidate.fullDescription,
	};
}

function isBuiltInCandidate(
	candidate: ExtensionCommandCandidate,
): candidate is BuiltInSdlCommandCandidate {
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

function formatSource(source: ExtensionSourceInfo): string {
	return source.path === undefined ? source.label : `${source.label} (${source.path})`;
}
