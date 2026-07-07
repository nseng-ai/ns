import { optionalEntry } from "@nseng-ai/foundation/primitives";

import { defineExtension } from "../sdk/command.ts";
import type { RepoLocalNsExtensionDescriptor } from "../sdk/repo-local-ns-extension.ts";
import type { PreinstalledNsCommandCatalogEntry } from "./registry.ts";

export function repoLocalNsExtensionToPreinstalledCatalog(
	descriptor: RepoLocalNsExtensionDescriptor,
): readonly PreinstalledNsCommandCatalogEntry[] {
	return descriptor.commands.map((commandDescriptor) => ({
		group: descriptor.group,
		groupDescription: descriptor.description,
		name: commandDescriptor.manifestName ?? commandDescriptor.command.name,
		description: commandDescriptor.command.summary,
		fullDescription: commandDescriptor.command.description,
		...optionalEntry("path", commandDescriptor.manifestPath),
		displayPath: commandDescriptor.packageExport,
		load: () => defineExtension({ commands: [commandDescriptor.command] }),
	}));
}
