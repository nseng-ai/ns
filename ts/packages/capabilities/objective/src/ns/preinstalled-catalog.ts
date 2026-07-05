import { optionalEntry } from "@nseng-ai/core/primitives";
import type { PreinstalledNsCommandCatalogEntry } from "@nseng-ai/kernel/cli";
import { defineExtension } from "@nseng-ai/kernel/sdk";

import { objectiveRepoLocalNsExtension } from "./repo-local-ns-extension.ts";

export const objectivePreinstalledNsCommandCatalog = objectiveRepoLocalNsExtension.commands.map(
	(descriptor) => ({
		group: objectiveRepoLocalNsExtension.group,
		groupDescription: objectiveRepoLocalNsExtension.description,
		name: descriptor.manifestName ?? descriptor.command.name,
		description: descriptor.command.summary,
		fullDescription: descriptor.command.description,
		...optionalEntry("path", descriptor.manifestPath),
		displayPath: descriptor.packageExport,
		load: () => defineExtension({ commands: [descriptor.command] }),
	}),
) satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listObjectivePreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return objectivePreinstalledNsCommandCatalog;
}
