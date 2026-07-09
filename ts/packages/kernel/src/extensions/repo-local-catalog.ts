import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { defineExtension } from "../sdk/command.ts";
import type { DescriptorCommand, ExtensionDescriptor, ExtensionEntry } from "../sdk/descriptor.ts";
import type { NsCommand } from "../sdk/command.ts";
import type {
	RepoLocalNsExtensionCommandDescriptor,
	RepoLocalNsExtensionDescriptor,
} from "../sdk/repo-local-ns-extension.ts";
import { commandKey } from "./command-registry.ts";
import type { PreinstalledNsCommandCatalogEntry } from "./registry.ts";

export function repoLocalNsExtensionToPreinstalledCatalog(
	descriptor: RepoLocalNsExtensionDescriptor,
): readonly PreinstalledNsCommandCatalogEntry[] {
	return descriptor.commands.map((commandDescriptor) => ({
		group: descriptor.group,
		groupDescription: descriptor.description,
		...repoLocalNsCommandDescriptorToPreinstalledCatalogEntry(commandDescriptor),
	}));
}

export interface ExtensionDescriptorToPreinstalledCatalogOptions {
	readonly displayPath: string;
	readonly helpGroup?: string;
	readonly entryHelpGroup?: (
		entry: ExtensionEntry,
		segments: readonly string[],
	) => string | undefined;
}

export function extensionDescriptorToPreinstalledCatalog(
	descriptor: ExtensionDescriptor,
	options: ExtensionDescriptorToPreinstalledCatalogOptions,
): readonly PreinstalledNsCommandCatalogEntry[] {
	return (descriptor.entries ?? []).flatMap((entry) =>
		descriptorEntryToPreinstalledCatalog({
			descriptor,
			entry,
			segments: descriptor.group === undefined ? [] : [descriptor.group],
			hiddenSegments: [],
			displayPath: options.displayPath,
			...optionalEntry("helpGroup", options.helpGroup),
			...optionalEntry("entryHelpGroup", options.entryHelpGroup),
		}),
	);
}

function descriptorEntryToPreinstalledCatalog(options: {
	descriptor: ExtensionDescriptor;
	entry: ExtensionEntry;
	segments: readonly string[];
	hiddenSegments: readonly string[];
	displayPath: string;
	helpGroup?: string;
	entryHelpGroup?: (entry: ExtensionEntry, segments: readonly string[]) => string | undefined;
}): readonly PreinstalledNsCommandCatalogEntry[] {
	if ("load" in options.entry) {
		const commandEntry = options.entry;
		const segments = [...options.segments, commandEntry.name];
		return [
			{
				name: commandEntry.name,
				description: `Load ns descriptor command ${segments.join(" ")}.`,
				fullDescription: `Load ns descriptor command ${segments.join(" ")}.`,
				...(options.segments.length === 1
					? { group: options.segments[0], groupDescription: options.descriptor.description }
					: {}),
				...optionalEntry("path", segments),
				...optionalEntry("hiddenSegments", options.hiddenSegments),
				...optionalEntry(
					"helpGroup",
					options.entryHelpGroup?.(commandEntry, segments) ?? options.helpGroup,
				),
				hasStaticCommandInfo: false,
				displayPath: `${options.displayPath}#${segments.join("/")}`,
				load: async () =>
					defineExtension({
						commands: [descriptorCommandAsNsCommand((await commandEntry.load()).default)],
					}),
			},
		];
	}
	const nextSegments = [...options.segments, options.entry.group];
	const hiddenSegments = options.entry.hidden
		? [...options.hiddenSegments, commandKey({ name: options.entry.group, segments: nextSegments })]
		: options.hiddenSegments;
	return options.entry.entries.flatMap((entry) =>
		descriptorEntryToPreinstalledCatalog({
			...options,
			entry,
			segments: nextSegments,
			hiddenSegments,
		}),
	);
}

export function descriptorCommandAsNsCommand(command: DescriptorCommand): NsCommand {
	if (isLegacyNsCommand(command)) return command;
	return {
		name: command.name,
		summary: command.summary,
		description: command.description,
		resultSchema: command.resultSchema,
		run: async (ctx) => await command.run(ctx, { argv: [] }),
	};
}

export function isLegacyNsCommand(command: DescriptorCommand): command is NsCommand {
	return (
		"schema" in command ||
		"positionals" in command ||
		"options" in command ||
		"renderHuman" in command ||
		"renderMarkdown" in command ||
		"completionProvider" in command
	);
}

export function repoLocalNsCommandDescriptorToPreinstalledCatalogEntry(
	commandDescriptor: RepoLocalNsExtensionCommandDescriptor,
): PreinstalledNsCommandCatalogEntry {
	return {
		name: commandDescriptor.manifestName ?? commandDescriptor.command.name,
		description: commandDescriptor.command.summary,
		fullDescription: commandDescriptor.command.description,
		...optionalEntry("path", commandDescriptor.manifestPath),
		displayPath: commandDescriptor.packageExport,
		load: () => defineExtension({ commands: [commandDescriptor.command] }),
	};
}
