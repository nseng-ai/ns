import harnessArtifactsExtension from "@nseng-ai/harness-artifacts/ns-extension";
import {
	extensionDescriptorToPreinstalledCatalog,
	runCli,
	type NsCliDeps,
	type PreinstalledNsCommandCatalogEntry,
	NS_BUILT_IN_HELP_GROUP,
} from "@nseng-ai/kernel/cli";
import { createRealNsCommandContext } from "@nseng-ai/kernel/context";
import nsInitExtension from "@nseng-ai/ns-init/ns-extension";

import { PiTextGenerator } from "./pi-text-generation.ts";

export interface RunNsCliDeps extends Omit<NsCliDeps, "context"> {
	context?: NsCliDeps["context"];
}

export async function runNsCli(args: readonly string[], deps: RunNsCliDeps = {}): Promise<number> {
	const context =
		deps.context ??
		createRealNsCommandContext({
			textGenerator: new PiTextGenerator(),
			...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
			...(deps.env === undefined ? {} : { env: deps.env }),
			...(deps.homeDir === undefined ? {} : { homeDir: deps.homeDir }),
		});
	return await runCli(args, {
		...deps,
		context,
		entryMetaUrl: new URL("../cli.ts", import.meta.url).href,
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
