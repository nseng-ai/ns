#!/usr/bin/env node

import { runCli, type NsCliDeps } from "@ns/kernel/cli";
import { listObjectivePreinstalledNsCommandCatalogEntries } from "@ns/objective/ns/preinstalled-catalog";

export async function runNsCli(args: readonly string[], deps: NsCliDeps = {}): Promise<number> {
	return await runCli(args, {
		...deps,
		preinstalledCommandCatalog: listNsPreinstalledCommandCatalogEntries,
	});
}

function listNsPreinstalledCommandCatalogEntries() {
	return [...listObjectivePreinstalledNsCommandCatalogEntries()];
}

if (import.meta.main) {
	process.exitCode = await runNsCli(process.argv.slice(2));
}
