import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { ExtensionDescriptor, ExtensionEntry } from "../sdk/descriptor.ts";
import { nextDescriptorTraversalState } from "./descriptor-traversal.ts";
import { NS_BUILT_IN_HELP_GROUP } from "./help-presentation.ts";
import type {
	PreinstalledNsCommandCatalog,
	PreinstalledNsCommandCatalogEntry,
} from "./registry.ts";

export interface ExtensionDescriptorToPreinstalledCatalogOptions {
	readonly displayPath: string;
	readonly helpGroup?: string;
	readonly entryHelpGroup?: (
		entry: ExtensionEntry,
		segments: readonly string[],
	) => string | undefined;
}

export interface PreinstalledNsExtensionRegistration extends ExtensionDescriptorToPreinstalledCatalogOptions {
	readonly packageName: string;
	readonly descriptor: ExtensionDescriptor;
}

export function preinstalledNsCommandCatalogFromRegistrations(
	registrations: readonly PreinstalledNsExtensionRegistration[],
): PreinstalledNsCommandCatalog {
	return {
		entries: registrations.flatMap((registration) =>
			extensionDescriptorToPreinstalledCatalog(registration.descriptor, registration),
		),
		extensionPackageNames: registrations.map((registration) => registration.packageName),
	};
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
			helpGroup: options.helpGroup ?? NS_BUILT_IN_HELP_GROUP,
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
				...optionalEntry("requiresExtension", commandEntry.requiresExtension),
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
	const nextState = nextDescriptorTraversalState(options.entry, options);
	return options.entry.entries.flatMap((entry) =>
		descriptorEntryToPreinstalledCatalog({
			...options,
			entry,
			...nextState,
		}),
	);
}
