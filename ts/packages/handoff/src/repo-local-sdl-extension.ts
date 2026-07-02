import {
	defineRepoLocalSdlExtensionDescriptor,
	repoLocalSdlCommandDescriptor,
} from "@sdl/kernel/sdk";

import { handoffCreateSdlCommand } from "./sdl/commands/create.ts";
import { handoffDeleteSdlCommand } from "./sdl/commands/delete.ts";
import { handoffGcSdlCommand } from "./sdl/commands/gc.ts";
import { handoffListSdlCommand } from "./sdl/commands/list.ts";
import { handoffPickupSdlCommand } from "./sdl/commands/pickup.ts";

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
			packageExportPrefix: "@sdl/handoff/sdl/commands",
		}),
	),
});
