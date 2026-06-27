import { defineExtension } from "sdl-sdk";

import { handoffSdlCommand } from "../command.ts";
import {
	deleteRequestSchema,
	deleteResultSchema,
	renderDelete,
	runDelete,
} from "../../operations/delete.ts";

export const handoffDeleteSdlCommand = handoffSdlCommand({
	name: "delete",
	summary: "Delete a handoff by slug.",
	description: "Delete one handoff by exact slug.",
	schema: deleteRequestSchema,
	resultSchema: deleteResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runDelete,
	renderHuman: renderDelete,
});

export default defineExtension({
	commands: [handoffDeleteSdlCommand],
});
