import { homedir } from "node:os";
import { join } from "node:path";

import {
	SDL_COMMAND_NAME_PATTERN,
	SDL_COMMAND_NAME_RULE,
	commandInfoForLoadedCommand,
	listBuiltInSdlCommandCandidates,
	validateSdlExtensionContribution,
	type BuiltInSdlCommandCandidate,
	type SdlCommandCandidate,
	type SdlCommandCliInfo,
	type SdlCommandSourceInfo,
	type SdlCommandSourceLevel,
} from "./command-registry.ts";
import { discoverExtensionsInRoot, type DiscoveredExtensionCommand, type ExtensionDiscoveryDiagnostic } from "./extension-discovery.ts";
import { loadSdlExtensionContribution, type ExtensionLoadDiagnostic } from "./extension-loader.ts";
import type { SdlCommand } from "./sdk.ts";

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
	| { ok: true; command: SdlCommand; source: ExtensionSourceInfo }
	| { ok: false; diagnostic: ExtensionErrorDiagnostic };

export interface DiagnosticClassification {
	fatal: readonly ExtensionErrorDiagnostic[];
	warnings: readonly ExtensionErrorDiagnostic[];
}

interface LoadSdlCommandCatalogOptions {
	cwd: string;
	homeDir?: string | undefined;
}

interface LoadedLevelCandidate {
	name: string;
	candidate: ExtensionCommandCandidate;
	source: ExtensionSourceInfo;
}

const ORDERED_SOURCE_LEVELS = ["built-in", "global", "project"] as const satisfies readonly ExtensionSourceLevel[];

export async function loadSdlCommandCatalog(options: LoadSdlCommandCatalogOptions): Promise<SdlCommandCatalog> {
	const diagnostics: ExtensionDiagnostic[] = [];
	const builtInCandidates = listBuiltInSdlCommandCandidates();
	const home = options.homeDir ?? homedir();
	const globalCandidates = loadRootCandidates({ level: "global", rootDir: join(home, ".asdl", "extensions") });
	const projectCandidates = loadRootCandidates({ level: "project", rootDir: join(options.cwd, ".asdl", "extensions") });
	diagnostics.push(...globalCandidates.diagnostics, ...projectCandidates.diagnostics);

	const candidatesByLevel = {
		"built-in": builtInCandidates,
		global: globalCandidates.candidates,
		project: projectCandidates.candidates,
	} satisfies Record<ExtensionSourceLevel, readonly ExtensionCommandCandidate[]>;

	const merged = new Map<string, LoadedLevelCandidate>();
	for (const level of ORDERED_SOURCE_LEVELS) {
		const levelCandidates = candidatesByLevel[level];
		const validation = validateLevelCandidates(level, levelCandidates);
		diagnostics.push(...validation.diagnostics);
		for (const candidate of validation.candidates) {
			const existing = merged.get(candidate.name);
			if (existing !== undefined) {
				diagnostics.push({
					severity: "info",
					code: "extension_command_override",
					message: `SDL command ${candidate.name} from ${formatSource(candidate.source)} overrides ${formatSource(existing.source)}.`,
					commandName: candidate.name,
					overriddenSource: existing.source,
					overridingSource: candidate.source,
				});
			}
			merged.set(candidate.name, candidate);
		}
	}

	const sortedCandidates = [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
	return {
		candidates: new Map(sortedCandidates.map((candidate) => [candidate.name, candidate.candidate])),
		commandInfos: sortedCandidates.map(({ candidate }) => ({ name: candidate.name, description: candidate.description, fullDescription: candidate.fullDescription })),
		diagnostics,
	};
}

export async function loadSelectedSdlCommand(candidate: ExtensionCommandCandidate): Promise<SelectedSdlCommandLoadResult> {
	if (isBuiltInCandidate(candidate)) {
		return { ok: true, command: candidate.command, source: candidate.source };
	}

	const loaded = await loadSdlExtensionContribution(candidate.entryPath);
	if (!loaded.ok) {
		return { ok: false, diagnostic: fromLoadDiagnostic(loaded.diagnostic, candidate.source.level, candidate.name) };
	}
	const validation = validateSdlExtensionContribution(loaded.defaultExport, candidate.name, formatSource(candidate.source));
	if (!validation.ok) {
		return {
			ok: false,
			diagnostic: {
				severity: "error",
				code: "extension_command_invalid",
				message: validation.message,
				path: candidate.entryPath,
				sourceLevel: candidate.source.level,
				commandName: candidate.name,
			},
		};
	}
	return { ok: true, command: validation.command, source: candidate.source };
}

export function commandInfosForSelectedCommand(
	commandInfos: readonly SdlCommandCliInfo[],
	loaded: { command: SdlCommand; source: ExtensionSourceInfo } | undefined,
): readonly SdlCommandCliInfo[] {
	if (loaded === undefined) return commandInfos;
	const loadedInfo = commandInfoForLoadedCommand(loaded.command, loaded.source.level);
	return commandInfos.map((info) => (info.name === loadedInfo.name ? loadedInfo : info));
}

export function classifyExtensionDiagnosticsForInvocation(options: {
	diagnostics: readonly ExtensionDiagnostic[];
	requestedCommandName: string | undefined;
	selectedCandidate: ExtensionCommandCandidate | undefined;
}): DiagnosticClassification {
	const errorDiagnostics = options.diagnostics.filter((diagnostic): diagnostic is ExtensionErrorDiagnostic => diagnostic.severity === "error");
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

export function formatExtensionErrorDiagnostics(diagnostics: readonly ExtensionDiagnostic[]): string {
	return formatExtensionDiagnosticMessages(diagnostics.filter((diagnostic): diagnostic is ExtensionErrorDiagnostic => diagnostic.severity === "error"));
}

export function formatExtensionWarningDiagnostics(diagnostics: readonly ExtensionErrorDiagnostic[]): string {
	return formatExtensionDiagnosticMessages(diagnostics, { prefix: "Warning: " });
}

function formatExtensionDiagnosticMessages(diagnostics: readonly ExtensionErrorDiagnostic[], options: { prefix?: string | undefined } = {}): string {
	const prefix = options.prefix ?? "";
	return diagnostics.map((diagnostic) => `${prefix}${diagnostic.message}`).join("\n");
}

function isFatalForSelectedCandidate(diagnostic: ExtensionErrorDiagnostic, selectedCandidate: ExtensionCommandCandidate | undefined): boolean {
	if (selectedCandidate === undefined) return true;
	if (diagnostic.sourceLevel === undefined) return true;
	return sourceLevelRank(diagnostic.sourceLevel) >= sourceLevelRank(selectedCandidate.source.level);
}

function loadRootCandidates(options: { level: "global" | "project"; rootDir: string }): { diagnostics: readonly ExtensionDiagnostic[]; candidates: readonly ExtensionCommandCandidate[] } {
	const discovered = discoverExtensionsInRoot(options.rootDir);
	return {
		diagnostics: discovered.diagnostics.map((diagnostic) => fromDiscoveryDiagnostic(diagnostic, options.level)),
		candidates: discovered.commands.map((command) => externalCandidateForLevel(command, options.level)),
	};
}

function externalCandidateForLevel(command: DiscoveredExtensionCommand, level: "global" | "project"): ExternalSdlCommandCandidate {
	return {
		name: command.name,
		description: command.description,
		fullDescription: command.fullDescription,
		entryPath: command.entryPath,
		source: { level, label: command.displayPath, path: command.entryPath },
	};
}

function validateLevelCandidates(
	level: ExtensionSourceLevel,
	candidates: readonly ExtensionCommandCandidate[],
): { candidates: readonly LoadedLevelCandidate[]; diagnostics: readonly ExtensionDiagnostic[] } {
	const diagnostics: ExtensionDiagnostic[] = [];
	const validated: LoadedLevelCandidate[] = [];
	for (const candidate of candidates) {
		if (!SDL_COMMAND_NAME_PATTERN.test(candidate.name)) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_name_invalid",
				message: `Invalid SDL command candidate from ${formatSource(candidate.source)}: command name must match ${SDL_COMMAND_NAME_RULE}.`,
				...(candidate.source.path === undefined ? {} : { path: candidate.source.path }),
				sourceLevel: candidate.source.level,
				commandName: candidate.name,
			});
			continue;
		}
		validated.push({ name: candidate.name, candidate, source: candidate.source });
	}

	const candidatesByName = new Map<string, readonly LoadedLevelCandidate[]>();
	for (const candidate of validated) {
		const existing = candidatesByName.get(candidate.name) ?? [];
		candidatesByName.set(candidate.name, [...existing, candidate]);
	}

	const duplicateNames = new Set([...candidatesByName.entries()].filter(([, matches]) => matches.length > 1).map(([name]) => name));
	for (const name of duplicateNames) {
		const matches = candidatesByName.get(name) ?? [];
		diagnostics.push({
			severity: "error",
			code: "extension_command_duplicate_in_level",
			message: `Duplicate SDL command ${name} within ${level} extension source level: ${matches.map((match) => formatSource(match.source)).join(", ")}.`,
			sourceLevel: level,
			commandName: name,
		});
	}
	return { candidates: validated.filter((candidate) => !duplicateNames.has(candidate.name)), diagnostics };
}

function sourceLevelRank(level: ExtensionSourceLevel): number {
	const rank = ORDERED_SOURCE_LEVELS.indexOf(level);
	if (rank === -1) {
		throw new Error(`Missing SDL extension source-level order for ${level}.`);
	}
	return rank;
}

function isBuiltInCandidate(candidate: ExtensionCommandCandidate): candidate is BuiltInSdlCommandCandidate {
	return candidate.source.level === "built-in";
}

function fromDiscoveryDiagnostic(diagnostic: ExtensionDiscoveryDiagnostic, sourceLevel: ExtensionSourceLevel): ExtensionErrorDiagnostic {
	return { ...diagnostic, sourceLevel };
}

function fromLoadDiagnostic(diagnostic: ExtensionLoadDiagnostic, sourceLevel: ExtensionSourceLevel, commandName: string): ExtensionErrorDiagnostic {
	return { ...diagnostic, sourceLevel, commandName };
}

function formatSource(source: ExtensionSourceInfo): string {
	return source.path === undefined ? source.label : `${source.label} (${source.path})`;
}
