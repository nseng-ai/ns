import {
	defineRepoLocalNsExtensionDescriptor,
	repoLocalNsCommandDescriptor,
} from "@nseng-ai/kernel/sdk";

import { handoffCreateNsCommand } from "./commands/create.ts";
import { handoffDeleteNsCommand } from "./commands/delete.ts";
import { handoffGcNsCommand } from "./commands/gc.ts";
import { handoffListNsCommand } from "./commands/list.ts";
import { handoffPickupNsCommand } from "./commands/pickup.ts";

export const handoffRepoLocalNsExtension = defineRepoLocalNsExtensionDescriptor({
	group: "handoff",
	description: "Create, list, pick up, and clean up branch handoffs.",
	commands: [
		handoffListNsCommand,
		handoffDeleteNsCommand,
		handoffGcNsCommand,
		handoffCreateNsCommand,
		handoffPickupNsCommand,
	].map((command) =>
		repoLocalNsCommandDescriptor({
			command,
			packageExportPrefix: "@nseng-ai/handoff/ns/commands",
		}),
	),
});
