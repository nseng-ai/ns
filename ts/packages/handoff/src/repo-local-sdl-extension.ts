import { defineRepoLocalSdlExtensionDescriptor } from "sdl-sdk";

import { handoffCreateSdlCommand } from "./sdl/commands/create.ts";
import { handoffDeleteSdlCommand } from "./sdl/commands/delete.ts";
import { handoffGcSdlCommand } from "./sdl/commands/gc.ts";
import { handoffListSdlCommand } from "./sdl/commands/list.ts";
import { handoffPickupSdlCommand } from "./sdl/commands/pickup.ts";

export const handoffRepoLocalSdlExtension = defineRepoLocalSdlExtensionDescriptor({
	group: "handoff",
	description: "Create, list, pick up, and clean up branch handoffs.",
	commands: [
		{
			command: handoffListSdlCommand,
			manifestEntry: "./src/commands/list.ts",
			packageExport: "@sdl/handoff/sdl/commands/list",
		},
		{
			command: handoffDeleteSdlCommand,
			manifestEntry: "./src/commands/delete.ts",
			packageExport: "@sdl/handoff/sdl/commands/delete",
		},
		{
			command: handoffGcSdlCommand,
			manifestEntry: "./src/commands/gc.ts",
			packageExport: "@sdl/handoff/sdl/commands/gc",
		},
		{
			command: handoffCreateSdlCommand,
			manifestEntry: "./src/commands/create.ts",
			packageExport: "@sdl/handoff/sdl/commands/create",
		},
		{
			command: handoffPickupSdlCommand,
			manifestEntry: "./src/commands/pickup.ts",
			packageExport: "@sdl/handoff/sdl/commands/pickup",
		},
	],
});
