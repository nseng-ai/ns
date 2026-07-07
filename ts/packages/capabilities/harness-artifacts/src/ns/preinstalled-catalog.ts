import type { PreinstalledNsCommandCatalogEntry } from "@nseng-ai/kernel/cli";
import { defineExtension, type NsCommand } from "@nseng-ai/kernel/sdk";

import { nsUpdateCommand } from "./commands/update.ts";
import { skillsInstallNsCommand } from "./commands/install.ts";
import { skillsListNsCommand } from "./commands/list.ts";
import { skillsPathNsCommand } from "./commands/path.ts";

const SKILLS_GROUP_DESCRIPTION = "List and provision ns-owned skills into assistant harnesses.";

export const skillsPreinstalledNsCommandCatalog = [
	skillsGroupCatalogEntry(skillsListNsCommand),
	skillsGroupCatalogEntry(skillsPathNsCommand),
	skillsGroupCatalogEntry(skillsInstallNsCommand),
	preinstalledCatalogEntry(nsUpdateCommand),
] satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listSkillsPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return skillsPreinstalledNsCommandCatalog;
}

function skillsGroupCatalogEntry(command: NsCommand): PreinstalledNsCommandCatalogEntry {
	return {
		group: "skills",
		groupDescription: SKILLS_GROUP_DESCRIPTION,
		...preinstalledCatalogEntry(command),
	};
}

function preinstalledCatalogEntry(command: NsCommand): PreinstalledNsCommandCatalogEntry {
	return {
		name: command.name,
		description: command.summary,
		fullDescription: command.description,
		displayPath: `@nseng-ai/harness-artifacts/ns/commands/${command.name}`,
		load: () => defineExtension({ commands: [command] }),
	};
}
