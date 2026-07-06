import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { PreinstalledNsCommandCatalogEntry } from "@nseng-ai/kernel/cli";
import { defineExtension } from "@nseng-ai/kernel/sdk";

import { skillsRepoLocalNsExtension } from "./repo-local-ns-extension.ts";

export const skillsPreinstalledNsCommandCatalog = skillsRepoLocalNsExtension.commands.map(
	(descriptor) => ({
		group: skillsRepoLocalNsExtension.group,
		groupDescription: skillsRepoLocalNsExtension.description,
		name: descriptor.manifestName ?? descriptor.command.name,
		description: descriptor.command.summary,
		fullDescription: descriptor.command.description,
		...optionalEntry("path", descriptor.manifestPath),
		displayPath: descriptor.packageExport,
		load: () => defineExtension({ commands: [descriptor.command] }),
	}),
) satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listSkillsPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return skillsPreinstalledNsCommandCatalog;
}
