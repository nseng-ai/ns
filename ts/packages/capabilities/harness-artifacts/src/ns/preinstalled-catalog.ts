import {
	repoLocalNsCommandDescriptorToPreinstalledCatalogEntry,
	repoLocalNsExtensionToPreinstalledCatalog,
	type PreinstalledNsCommandCatalogEntry,
} from "@nseng-ai/kernel/cli";

import {
	nsUpdateRepoLocalNsCommandDescriptor,
	skillsRepoLocalNsExtension,
} from "./repo-local-ns-extension.ts";

export const skillsPreinstalledNsCommandCatalog = [
	...repoLocalNsExtensionToPreinstalledCatalog(skillsRepoLocalNsExtension),
	repoLocalNsCommandDescriptorToPreinstalledCatalogEntry(nsUpdateRepoLocalNsCommandDescriptor),
] satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listSkillsPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return skillsPreinstalledNsCommandCatalog;
}
