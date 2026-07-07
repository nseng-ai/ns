import {
	repoLocalNsExtensionToPreinstalledCatalog,
	type PreinstalledNsCommandCatalogEntry,
} from "@nseng-ai/kernel/cli";
import { defineExtension } from "@nseng-ai/kernel/sdk";

import { nsUpdateCommand } from "./commands/update.ts";
import { skillsRepoLocalNsExtension } from "./repo-local-ns-extension.ts";

export const skillsPreinstalledNsCommandCatalog = [
	...repoLocalNsExtensionToPreinstalledCatalog(skillsRepoLocalNsExtension),
	{
		name: nsUpdateCommand.name,
		description: nsUpdateCommand.summary,
		fullDescription: nsUpdateCommand.description,
		displayPath: "@nseng-ai/harness-artifacts/ns/commands/update",
		load: () => defineExtension({ commands: [nsUpdateCommand] }),
	},
] satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listSkillsPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return skillsPreinstalledNsCommandCatalog;
}
