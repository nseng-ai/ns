import {
	repoLocalNsCommandDescriptorToPreinstalledCatalogEntry,
	repoLocalNsExtensionToPreinstalledCatalog,
	type PreinstalledNsCommandCatalogEntry,
} from "@nseng-ai/kernel/cli";
import { repoLocalNsCommandDescriptor } from "@nseng-ai/kernel/sdk";

import { nsUpdateCommand } from "./commands/update.ts";
import {
	HARNESS_ARTIFACT_NS_COMMAND_EXPORT_PREFIX,
	skillsRepoLocalNsExtension,
} from "./repo-local-ns-extension.ts";

const nsUpdateCommandDescriptor = repoLocalNsCommandDescriptor({
	command: nsUpdateCommand,
	packageExportPrefix: HARNESS_ARTIFACT_NS_COMMAND_EXPORT_PREFIX,
});

export const skillsPreinstalledNsCommandCatalog = [
	...repoLocalNsExtensionToPreinstalledCatalog(skillsRepoLocalNsExtension),
	repoLocalNsCommandDescriptorToPreinstalledCatalogEntry(nsUpdateCommandDescriptor),
] satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listSkillsPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return skillsPreinstalledNsCommandCatalog;
}
