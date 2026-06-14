import { homedir } from "node:os";
import { join } from "node:path";

import {
	SDL_COMMAND_NAME_PATTERN,
	SDL_COMMAND_NAME_RULE,
	commandInfoForLoadedCommand,
	listBuiltInSdlCommandCandidates,
	validateSdlCommand,
	type BuiltInSdlCommandCandidate,
	type SdlCommandCandidate,
	type SdlCommandCliInfo,
	type SdlCommandSourceInfo,
	type SdlCommandSourceLevel,
} from "./command-registry.ts";
import { discoverExtensionsInRoot, type DiscoveredExtensionCommand, type ExtensionDiscoveryDiagnostic } from "./extension-discovery.ts";
import { loadSdlCommandEntry, type ExtensionLoadDiagnostic } from "./extension-loader.ts";
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

interface LoadSdlCommandCatalogOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	homeDir?: string | undefined;
}

interface LoadedLevelCandidate {
	name: string;
	candidate: ExtensionCommandCandidate;
	source: ExtensionSourceInfo;
}

const SOURCE_LEVELS = ["built-in", "global", "project"] as const satisfies readonly ExtensionSourceLevel[];

export async function loadSdlCommandCatalog(options: LoadSdlCommandCatalogOptions): Promise<SdlCommandCatalog> {
	void options.env;
	const diagnostics: ExtensionDiagnostic[] = [];
	let candidatesByLevel = emptyCandidatesByLevel();

	for (const candidate of listBuiltInSdlCommandCandidates()) {
		candidatesByLevel = addCandidate({ candidatesByLevel, candidate });
	}

	const home = options.homeDir ?? homedir();
	const globalCandidates = loadRootCandidates({ level: "global", rootDir: join(home, ".asdl", "extensions") });
	diagnostics.push(...globalCandidates.diagnostics);
	candidatesByLevel = addCandidates({ candidatesByLevel, candidates: globalCandidates.candidates });
	const projectCandidates = loadRootCandidates({ level: "project", rootDir: join(options.cwd, ".asdl", "extensions") });
	diagnostics.push(...projectCandidates.diagnostics);
	candidatesByLevel = addCandidates({ candidatesByLevel, candidates: projectCandidates.candidates });

	const merged = new Map<string, LoadedLevelCandidate>();
	for (const level of SOURCE_LEVELS) {
		const levelCandidates = candidatesByLevel.get(level) ?? [];
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

	const loaded = await loadSdlCommandEntry(candidate.entryPath);
	if (!loaded.ok) {
		return { ok: false, diagnostic: fromLoadDiagnostic(loaded.diagnostic, candidate.source.level) };
	}
	const validation = validateSdlCommand(loaded.defaultExport, candidate.name, formatSource(candidate.source));
	if (!validation.ok) {
		return {
			ok: false,
			diagnostic: {
				severity: "error",
				code: "extension_command_invalid",
				message: validation.message,
				path: candidate.entryPath,
				sourceLevel: candidate.source.level,
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

export function hasExtensionErrors(diagnostics: readonly ExtensionDiagnostic[]): boolean {
	return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function formatExtensionErrorDiagnostics(diagnostics: readonly ExtensionDiagnostic[]): string {
	return diagnostics
		.filter((diagnostic): diagnostic is ExtensionErrorDiagnostic => diagnostic.severity === "error")
		.map((diagnostic) => diagnostic.message)
		.join("\n");
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
			});
			continue;
		}
		validated.push({ name: candidate.name, candidate, source: candidate.source });
	}

	const counts = new Map<string, LoadedLevelCandidate[]>();
	for (const candidate of validated) {
		counts.set(candidate.name, [...(counts.get(candidate.name) ?? []), candidate]);
	}
	const duplicateNames = new Set([...counts.entries()].filter(([, matches]) => matches.length > 1).map(([name]) => name));
	for (const name of duplicateNames) {
		const matches = counts.get(name) ?? [];
		diagnostics.push({
			severity: "error",
			code: "extension_command_duplicate_in_level",
			message: `Duplicate SDL command ${name} within ${level} extension source level: ${matches.map((match) => formatSource(match.source)).join(", ")}.`,
			sourceLevel: level,
		});
	}
	return { candidates: validated.filter((candidate) => !duplicateNames.has(candidate.name)), diagnostics };
}

function emptyCandidatesByLevel(): Map<ExtensionSourceLevel, ExtensionCommandCandidate[]> {
	return new Map(SOURCE_LEVELS.map((level) => [level, [] as ExtensionCommandCandidate[]]));
}

function addCandidates(options: {
	candidatesByLevel: ReadonlyMap<ExtensionSourceLevel, readonly ExtensionCommandCandidate[]>;
	candidates: readonly ExtensionCommandCandidate[];
}): Map<ExtensionSourceLevel, ExtensionCommandCandidate[]> {
	return options.candidates.reduce((candidatesByLevel, candidate) => addCandidate({ candidatesByLevel, candidate }), copyCandidatesByLevel(options.candidatesByLevel));
}

function addCandidate(options: {
	candidatesByLevel: ReadonlyMap<ExtensionSourceLevel, readonly ExtensionCommandCandidate[]>;
	candidate: ExtensionCommandCandidate;
}): Map<ExtensionSourceLevel, ExtensionCommandCandidate[]> {
	const next = copyCandidatesByLevel(options.candidatesByLevel);
	const existing = next.get(options.candidate.source.level) ?? [];
	next.set(options.candidate.source.level, [...existing, options.candidate]);
	return next;
}

function copyCandidatesByLevel(candidatesByLevel: ReadonlyMap<ExtensionSourceLevel, readonly ExtensionCommandCandidate[]>): Map<ExtensionSourceLevel, ExtensionCommandCandidate[]> {
	return new Map(SOURCE_LEVELS.map((level) => [level, [...(candidatesByLevel.get(level) ?? [])]]));
}

function isBuiltInCandidate(candidate: ExtensionCommandCandidate): candidate is BuiltInSdlCommandCandidate {
	return candidate.source.level === "built-in";
}

function fromDiscoveryDiagnostic(diagnostic: ExtensionDiscoveryDiagnostic, sourceLevel: ExtensionSourceLevel): ExtensionErrorDiagnostic {
	return { ...diagnostic, sourceLevel };
}

function fromLoadDiagnostic(diagnostic: ExtensionLoadDiagnostic, sourceLevel: ExtensionSourceLevel): ExtensionErrorDiagnostic {
	return { ...diagnostic, sourceLevel };
}

function formatSource(source: ExtensionSourceInfo): string {
	return source.path === undefined ? source.label : `${source.label} (${source.path})`;
}
