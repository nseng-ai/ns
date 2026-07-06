#!/usr/bin/env node

import {
	runCli,
	type PreinstalledNsCommandCatalogEntry,
	type NsCliDeps,
} from "@nseng-ai/kernel/cli";
import { listNsInitPreinstalledNsCommandCatalogEntries } from "@nseng-ai/ns-init/ns/preinstalled-catalog";
import { listObjectivePreinstalledNsCommandCatalogEntries } from "@nseng-ai/objectives/ns/preinstalled-catalog";

export async function runNsCli(args: readonly string[], deps: NsCliDeps = {}): Promise<number> {
	return await runCli(args, {
		...deps,
		preinstalledCommandCatalog: listPreinstalledNsCommandCatalogEntries,
	});
}

function listPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return [
		...listObjectivePreinstalledNsCommandCatalogEntries(),
		...listNsInitPreinstalledNsCommandCatalogEntries(),
	];
}

if (import.meta.main) {
	process.exitCode = await runNsCli(process.argv.slice(2));
}
