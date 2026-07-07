import {
	NS_BUILT_IN_HELP_GROUP,
	type PreinstalledNsCommandCatalogEntry,
} from "@nseng-ai/kernel/cli";
import { defineExtension } from "@nseng-ai/kernel/sdk";

import { nsInitNsCommand } from "./commands/init.ts";

export const nsInitPreinstalledNsCommandCatalog = [
	{
		name: nsInitNsCommand.name,
		description: nsInitNsCommand.summary,
		fullDescription: nsInitNsCommand.description,
		helpGroup: NS_BUILT_IN_HELP_GROUP,
		displayPath: "@nseng-ai/ns-init/ns/commands/init",
		load: () => defineExtension({ commands: [nsInitNsCommand] }),
	},
] satisfies readonly PreinstalledNsCommandCatalogEntry[];

export function listNsInitPreinstalledNsCommandCatalogEntries(): readonly PreinstalledNsCommandCatalogEntry[] {
	return nsInitPreinstalledNsCommandCatalog;
}
