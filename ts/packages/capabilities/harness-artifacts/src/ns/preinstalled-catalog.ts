import {
	repoLocalNsExtensionToPreinstalledCatalog,
	type PreinstalledNsCommandCatalogEntry,
} from "@nseng-ai/kernel/cli";

import { nsUpdateCommand } from "./commands/update.ts";
import { skillsRepoLocalNsExtension } from "./repo-local-ns-extension.ts";

export const skillsPreinstalledNsCommandCatalog = [
	...repoLocalNsExtensionToPreinstalledCatalog(skillsRepoLocalNsExtension),
	{
		name: nsUpdateCommand.name,
		description: nsUpdateCommand.summary,
		fullDescription: nsUpdateCommand.description,
		displayPath: "@nseng-ai/harness-artifacts/ns/commands/update",
		load: () => ({ commands: [nsUpdateCommand] }),
	},
] satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listSkillsPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return skillsPreinstalledNsCommandCatalog;
}
