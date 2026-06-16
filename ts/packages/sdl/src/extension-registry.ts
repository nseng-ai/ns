import { homedir } from "node:os";
import { join } from "node:path";

import changesExtension from "./built-in-extensions/changes.ts";
import {
	SDL_COMMAND_NAME_PATTERN,
	SDL_COMMAND_NAME_RULE,
	builtInCommandDefinitions,
	commandInfoForLoadedCommand,
	formatUnknownError,
	validateSdlCommand,
	type SdlCommandCliInfo,
} from "./command-registry.ts";
import { createExtensionApi, type ExtensionCommandContribution, type ExtensionFactory, type ExtensionSourceInfo, type ExtensionSourceLevel } from "./extension-api.ts";
import { discoverExtensionsInRoot, type ExtensionDiscoveryDiagnostic } from "./extension-discovery.ts";
import { loadExtensionFactory, type ExtensionLoadDiagnostic } from "./extension-loader.ts";
import type { SdlCommand } from "./sdk.ts";

export interface BuiltInExtensionSpec {
	id: string;
	factory: ExtensionFactory;
}

export interface LoadedExtensions {
	commands: ReadonlyMap<string, SdlCommand>;
	commandInfos: readonly SdlCommandCliInfo[];
	diagnostics: readonly ExtensionDiagnostic[];
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

interface LoadExtensionsOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	homeDir?: string | undefined;
	builtInExtensions?: readonly BuiltInExtensionSpec[] | undefined;
}

interface LoadedCommandContribution {
	name: string;
	command: SdlCommand;
	source: ExtensionSourceInfo;
}

const SOURCE_LEVELS = ["built-in", "global", "project"] as const satisfies readonly ExtensionSourceLevel[];

const DEFAULT_BUILT_IN_EXTENSIONS = [
	{ id: "changes", factory: changesExtension },
] as const satisfies readonly BuiltInExtensionSpec[];

export async function loadExtensions(options: LoadExtensionsOptions): Promise<LoadedExtensions> {
	void options.env;
	const diagnostics: ExtensionDiagnostic[] = [];
	const contributionsByLevel = new Map<ExtensionSourceLevel, ExtensionCommandContribution[]>();
	for (const level of SOURCE_LEVELS) {
		contributionsByLevel.set(level, []);
	}

	for (const [name, definition] of Object.entries(builtInCommandDefinitions)) {
		addContribution(contributionsByLevel, {
			name,
			command: definition.command,
			source: { level: "built-in", label: `built-in command ${name}` },
		});
	}

	for (const spec of options.builtInExtensions ?? DEFAULT_BUILT_IN_EXTENSIONS) {
		const source: ExtensionSourceInfo = { level: "built-in", label: `built-in extension ${spec.id}` };
		const result = await runExtensionFactory(spec.factory, source);
		diagnostics.push(...result.diagnostics);
		for (const contribution of result.contributions) addContribution(contributionsByLevel, contribution);
	}

	const home = options.homeDir ?? homedir();
	await loadRootExtensions({ level: "global", rootDir: join(home, ".asdl", "extensions"), diagnostics, contributionsByLevel });
	await loadRootExtensions({ level: "project", rootDir: join(options.cwd, ".asdl", "extensions"), diagnostics, contributionsByLevel });

	const merged = new Map<string, LoadedCommandContribution>();
	for (const level of SOURCE_LEVELS) {
		const contributions = contributionsByLevel.get(level) ?? [];
		const validation = validateLevelContributions(level, contributions);
		diagnostics.push(...validation.diagnostics);
		for (const contribution of validation.contributions) {
			const existing = merged.get(contribution.name);
			if (existing !== undefined) {
				diagnostics.push({
					severity: "info",
					code: "extension_command_override",
					message: `SDL command ${contribution.name} from ${formatSource(contribution.source)} overrides ${formatSource(existing.source)}.`,
					commandName: contribution.name,
					overriddenSource: existing.source,
					overridingSource: contribution.source,
				});
			}
			merged.set(contribution.name, contribution);
		}
	}

	const commands = new Map<string, SdlCommand>();
	const commandInfos: SdlCommandCliInfo[] = [];
	for (const contribution of [...merged.values()].sort((left, right) => left.name.localeCompare(right.name))) {
		commands.set(contribution.name, contribution.command);
		commandInfos.push(commandInfoForLoadedCommand(contribution.command, contribution.source.level));
	}
	return { commands, commandInfos, diagnostics };
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

async function loadRootExtensions(options: {
	level: "global" | "project";
	rootDir: string;
	diagnostics: ExtensionDiagnostic[];
	contributionsByLevel: Map<ExtensionSourceLevel, ExtensionCommandContribution[]>;
}): Promise<void> {
	const discovered = discoverExtensionsInRoot(options.rootDir);
	for (const diagnostic of discovered.diagnostics) {
		options.diagnostics.push(fromDiscoveryDiagnostic(diagnostic, options.level));
	}

	for (const extension of discovered.extensions) {
		const source: ExtensionSourceInfo = { level: options.level, label: extension.displayPath, path: extension.entryPath };
		const loaded = await loadExtensionFactory(extension.entryPath);
		if (!loaded.ok) {
			options.diagnostics.push(fromLoadDiagnostic(loaded.diagnostic, options.level));
			continue;
		}
		const result = await runExtensionFactory(loaded.factory, source);
		options.diagnostics.push(...result.diagnostics);
		for (const contribution of result.contributions) addContribution(options.contributionsByLevel, contribution);
	}
}

async function runExtensionFactory(
	factory: ExtensionFactory,
	source: ExtensionSourceInfo,
): Promise<{ contributions: readonly ExtensionCommandContribution[]; diagnostics: readonly ExtensionErrorDiagnostic[] }> {
	const created = createExtensionApi(source);
	try {
		await factory(created.api);
	} catch (error) {
		return {
			contributions: created.contributions,
			diagnostics: [
				{
					severity: "error",
					code: "extension_factory_failed",
					message: `Extension factory failed for ${formatSource(source)}.\n${formatUnknownError(error)}`,
					...(source.path === undefined ? {} : { path: source.path }),
					sourceLevel: source.level,
				},
			],
		};
	}
	return { contributions: created.contributions, diagnostics: [] };
}

function validateLevelContributions(
	level: ExtensionSourceLevel,
	contributions: readonly ExtensionCommandContribution[],
): {
	contributions: readonly LoadedCommandContribution[];
	diagnostics: readonly ExtensionDiagnostic[];
} {
	const diagnostics: ExtensionDiagnostic[] = [];
	const validated: LoadedCommandContribution[] = [];
	for (const contribution of contributions) {
		if (contribution.name === undefined || !SDL_COMMAND_NAME_PATTERN.test(contribution.name)) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_name_invalid",
				message: `Invalid SDL command contribution from ${formatSource(contribution.source)}: command name must match ${SDL_COMMAND_NAME_RULE}.`,
				...(contribution.source.path === undefined ? {} : { path: contribution.source.path }),
				sourceLevel: contribution.source.level,
			});
			continue;
		}
		const validation = validateSdlCommand(contribution.command, contribution.name, formatSource(contribution.source));
		if (!validation.ok) {
			diagnostics.push({
				severity: "error",
				code: "extension_command_invalid",
				message: validation.message,
				...(contribution.source.path === undefined ? {} : { path: contribution.source.path }),
				sourceLevel: contribution.source.level,
			});
			continue;
		}
		validated.push({ name: contribution.name, command: validation.command, source: contribution.source });
	}

	const counts = new Map<string, LoadedCommandContribution[]>();
	for (const contribution of validated) {
		counts.set(contribution.name, [...(counts.get(contribution.name) ?? []), contribution]);
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
	return {
		contributions: validated.filter((contribution) => !duplicateNames.has(contribution.name)),
		diagnostics,
	};
}

function addContribution(
	contributionsByLevel: Map<ExtensionSourceLevel, ExtensionCommandContribution[]>,
	contribution: ExtensionCommandContribution,
): void {
	const existing = contributionsByLevel.get(contribution.source.level) ?? [];
	contributionsByLevel.set(contribution.source.level, [...existing, contribution]);
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
