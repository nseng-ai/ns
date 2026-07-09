import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { ExtensionDescriptor, ExtensionEntry } from "../sdk/descriptor.ts";
import { commandKey } from "./command-registry.ts";
import type { PreinstalledNsCommandCatalogEntry } from "./registry.ts";

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
			hiddenAncestorKeys: [],
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
	hiddenAncestorKeys: readonly string[];
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
				...optionalEntry("hiddenAncestorKeys", options.hiddenAncestorKeys),
				...optionalEntry(
					"helpGroup",
					options.entryHelpGroup?.(commandEntry, segments) ?? options.helpGroup,
				),
				hasStaticCommandInfo: false,
				displayPath: `${options.displayPath}#${segments.join("/")}`,
				load: async () => (await commandEntry.load()).default,
			},
		];
	}
	const nextSegments = [...options.segments, options.entry.group];
	const hiddenAncestorKeys = options.entry.hidden
		? [
				...options.hiddenAncestorKeys,
				commandKey({ name: options.entry.group, segments: nextSegments }),
			]
		: options.hiddenAncestorKeys;
	return options.entry.entries.flatMap((entry) =>
		descriptorEntryToPreinstalledCatalog({
			...options,
			entry,
			segments: nextSegments,
			hiddenAncestorKeys,
		}),
	);
}
