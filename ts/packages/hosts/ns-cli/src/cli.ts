#!/usr/bin/env node

import { runCli, type NsCliDeps } from "@nseng-ai/kernel/cli";
import { listObjectivePreinstalledNsCommandCatalogEntries } from "@nseng-ai/objective/ns/preinstalled-catalog";

export async function runNsCli(args: readonly string[], deps: NsCliDeps = {}): Promise<number> {
	return await runCli(args, {
		...deps,
		preinstalledCommandCatalog: listObjectivePreinstalledNsCommandCatalogEntries,
	});
}

if (import.meta.main) {
	process.exitCode = await runNsCli(process.argv.slice(2));
}
