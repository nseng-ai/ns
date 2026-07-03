import { defineExtension } from "@ns/kernel/sdk";

import { handoffSdlCommand } from "../command.ts";
import {
	deleteRequestSchema,
	deleteResultSchema,
	renderDelete,
	runDelete,
} from "../../core/operations/delete.ts";

export const handoffDeleteSdlCommand = handoffSdlCommand({
	name: "delete",
	summary: "Delete a handoff by slug.",
	description: "Delete one handoff by exact slug.",
	schema: deleteRequestSchema,
	options: { branch: { short: "-b" }, yes: { short: "-y" } },
	resultSchema: deleteResultSchema,
	positionals: { slug: { position: 0 } },
	handler: runDelete,
	renderHuman: renderDelete,
});

export default defineExtension({
	commands: [handoffDeleteSdlCommand],
});
