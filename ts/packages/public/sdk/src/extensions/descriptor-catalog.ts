import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { ExtensionDescriptor, ExtensionEntry } from "../sdk/descriptor.ts";
import { nextDescriptorTraversalState } from "./descriptor-traversal.ts";
import { NS_EXTENSION_HELP_GROUP } from "./help-presentation.ts";
import type {
	PreinstalledNsCommandCatalog,
	PreinstalledNsCommandCatalogEntry,
} from "./registry.ts";

export interface ExtensionDescriptorToPreinstalledCatalogOptions {
	readonly displayPath: string;
	readonly packageName?: string;
	readonly contributionId?: string;
	readonly helpGroup?: string;
	readonly entryHelpGroup?: (
		entry: ExtensionEntry,
		segments: readonly string[],
	) => string | undefined;
}

export interface PreinstalledNsExtensionRegistration extends ExtensionDescriptorToPreinstalledCatalogOptions {
	readonly packageName: string;
	readonly userFacingKind: "built-in" | "extension";
	readonly descriptor: ExtensionDescriptor;
}

export function preinstalledNsCommandCatalogFromRegistrations(
	registrations: readonly PreinstalledNsExtensionRegistration[],
): PreinstalledNsCommandCatalog {
	return {
		entries: registrations.flatMap((registration, index) =>
			extensionDescriptorToPreinstalledCatalog(registration.descriptor, {
				...registration,
				packageName: registration.packageName,
				contributionId: `preinstalled:${index}:${registration.packageName}:${registration.displayPath}`,
			}),
		),
		extensionPackageNames: registrations.map((registration) => registration.packageName),
		builtInPackageNames: registrations
			.filter((registration) => registration.userFacingKind === "built-in")
			.map((registration) => registration.packageName),
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
			rootGroupDescription: descriptor.description,
			displayPath: options.displayPath,
			helpGroup: options.helpGroup ?? NS_EXTENSION_HELP_GROUP,
			packageName: options.packageName ?? options.displayPath,
			contributionId: options.contributionId ?? `preinstalled:${options.displayPath}`,
			requiresExtensions: descriptor.requiresExtensions ?? [],
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
	rootGroupDescription: string;
	helpGroup?: string;
	packageName: string;
	contributionId: string;
	requiresExtensions: readonly string[];
	entryHelpGroup?: (entry: ExtensionEntry, segments: readonly string[]) => string | undefined;
}): readonly PreinstalledNsCommandCatalogEntry[] {
	if ("load" in options.entry) {
		const commandEntry = options.entry;
		const segments = [...options.segments, commandEntry.name];
		const rootGroup = options.segments[0];
		return [
			{
				name: commandEntry.name,
				packageName: options.packageName,
				contributionId: options.contributionId,
				requiresExtensions: options.requiresExtensions,
				description: `Load ns descriptor command ${segments.join(" ")}.`,
				fullDescription: `Load ns descriptor command ${segments.join(" ")}.`,
				// The descriptor description labels the root group even when every command
				// nests deeper (for example a hidden exec group); help falls back to a
				// generated "NS <group> commands." string without it.
				...(rootGroup === undefined
					? {}
					: options.segments.length === 1
						? { group: rootGroup, groupDescription: options.rootGroupDescription }
						: { groupDescription: options.rootGroupDescription }),
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
	const groupEntry = options.entry;
	const nextState = nextDescriptorTraversalState(groupEntry, options);
	return groupEntry.entries.flatMap((entry) =>
		descriptorEntryToPreinstalledCatalog({
			...options,
			entry,
			...nextState,
		}),
	);
}
