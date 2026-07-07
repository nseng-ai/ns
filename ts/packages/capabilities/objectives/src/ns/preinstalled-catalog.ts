import {
	repoLocalNsExtensionToPreinstalledCatalog,
	type PreinstalledNsCommandCatalogEntry,
} from "@nseng-ai/kernel/cli";

import { objectiveRepoLocalNsExtension } from "./repo-local-ns-extension.ts";

export const objectivePreinstalledNsCommandCatalog = repoLocalNsExtensionToPreinstalledCatalog(
	objectiveRepoLocalNsExtension,
);

export function listObjectivePreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return objectivePreinstalledNsCommandCatalog;
}
