#!/usr/bin/env node

import harnessArtifactsExtension from "@nseng-ai/harness-artifacts/ns-extension";
import {
	extensionDescriptorToPreinstalledCatalog,
	runCli,
	type PreinstalledNsCommandCatalogEntry,
	type NsCliDeps,
	NS_BUILT_IN_HELP_GROUP,
} from "@nseng-ai/kernel/cli";
import nsInitExtension from "@nseng-ai/ns-init/ns-extension";

export async function runNsCli(args: readonly string[], deps: NsCliDeps = {}): Promise<number> {
	return await runCli(args, {
		...deps,
		preinstalledCommandCatalog: listPreinstalledNsCommandCatalogEntries,
	});
}

function listPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return [
		...extensionDescriptorToPreinstalledCatalog(nsInitExtension, {
			displayPath: "@nseng-ai/ns-init/ns-extension",
			helpGroup: NS_BUILT_IN_HELP_GROUP,
		}),
		...harnessArtifactsPreinstalledEntries(),
	];
}

function harnessArtifactsPreinstalledEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return extensionDescriptorToPreinstalledCatalog(harnessArtifactsExtension, {
		displayPath: "@nseng-ai/harness-artifacts/ns-extension",
		entryHelpGroup: (entry, segments) =>
			"load" in entry && entry.name === "update" && segments.length === 1
				? NS_BUILT_IN_HELP_GROUP
				: undefined,
	});
}

if (import.meta.main) {
	process.exitCode = await runNsCli(process.argv.slice(2));
}
