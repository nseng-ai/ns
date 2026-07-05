import { optionalEntry } from "@ns/core/primitives";
import type { PreinstalledNsCommandCatalogEntry } from "@ns/kernel/cli";
import { defineExtension } from "@ns/kernel/sdk";

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
