#!/usr/bin/env node

import { listSkillsPreinstalledNsCommandCatalogEntries } from "@nseng-ai/harness-artifacts/ns/preinstalled-catalog";
import {
	runCli,
	type PreinstalledNsCommandCatalogEntry,
	type NsCliDeps,
} from "@nseng-ai/kernel/cli";
import { listNsInitPreinstalledNsCommandCatalogEntries } from "@nseng-ai/ns-init/ns/preinstalled-catalog";

export async function runNsCli(args: readonly string[], deps: NsCliDeps = {}): Promise<number> {
	return await runCli(args, {
		...deps,
		preinstalledCommandCatalog: listPreinstalledNsCommandCatalogEntries,
	});
}

function listPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return [
		...listNsInitPreinstalledNsCommandCatalogEntries(),
		...listSkillsPreinstalledNsCommandCatalogEntries(),
	];
}

if (import.meta.main) {
	process.exitCode = await runNsCli(process.argv.slice(2));
}
