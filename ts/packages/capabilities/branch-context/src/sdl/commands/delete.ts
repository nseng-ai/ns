import { defineExtension } from "@sdl/kernel/sdk";

import { branchContextCommand } from "../command.ts";
import { deleteResultSchema, handleDelete, keyRequestSchema } from "../../core/operations.ts";

export const branchContextDeleteSdlCommand = branchContextCommand({
	name: "delete",
	summary: "Delete a branch-context entry.",
	description: "Delete a branch-context entry from the current or selected branch.",
	schema: keyRequestSchema,
	resultSchema: deleteResultSchema,
	positionals: { key: { position: 0 } },
	handler: handleDelete,
});

export default defineExtension({
	commands: [branchContextDeleteSdlCommand],
});
