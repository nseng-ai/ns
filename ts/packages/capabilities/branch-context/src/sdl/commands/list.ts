import { defineExtension } from "@sdl/kernel/sdk";

import { branchContextCommand } from "../command.ts";
import { handleList, listRequestSchema, listResultSchema } from "../../core/operations.ts";

export const branchContextListSdlCommand = branchContextCommand({
	name: "list",
	summary: "List branch-context entries.",
	description: "List branch-context entries attached to the current or selected branch.",
	schema: listRequestSchema,
	resultSchema: listResultSchema,
	handler: handleList,
});

export default defineExtension({
	commands: [branchContextListSdlCommand],
});
