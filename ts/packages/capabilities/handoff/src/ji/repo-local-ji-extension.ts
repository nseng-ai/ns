import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@ji/kernel/sdk";

import { handoffCreateSdlCommand } from "./commands/create.ts";
import { handoffDeleteSdlCommand } from "./commands/delete.ts";
import { handoffGcSdlCommand } from "./commands/gc.ts";
import { handoffListSdlCommand } from "./commands/list.ts";
import { handoffPickupSdlCommand } from "./commands/pickup.ts";

export const handoffRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "handoff",
	description: "Create, list, pick up, and clean up branch handoffs.",
	commands: [
		handoffListSdlCommand,
		handoffDeleteSdlCommand,
		handoffGcSdlCommand,
		handoffCreateSdlCommand,
		handoffPickupSdlCommand,
	].map((command) =>
		repoLocalSdlCommandDescriptor({
			command,
			packageExportPrefix: "@ji/handoff/ji/commands",
		}),
	),
});
