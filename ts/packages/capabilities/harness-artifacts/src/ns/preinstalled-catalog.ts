import {
	repoLocalNsExtensionToPreinstalledCatalog,
	type PreinstalledNsCommandCatalogEntry,
} from "@nseng-ai/kernel/cli";

import { skillsRepoLocalNsExtension } from "./repo-local-ns-extension.ts";

export const skillsPreinstalledNsCommandCatalog = repoLocalNsExtensionToPreinstalledCatalog(
	skillsRepoLocalNsExtension,
);

export function listSkillsPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return skillsPreinstalledNsCommandCatalog;
}
