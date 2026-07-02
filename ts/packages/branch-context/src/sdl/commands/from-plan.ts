import { defineExtension } from "@sdl/kernel/sdk";

import { branchContextCommand } from "../command.ts";
import { branchContextResultSchema, createRequestSchema, handleCreate } from "../../operations.ts";

export const branchContextFromPlanSdlCommand = branchContextCommand({
	name: "from-plan",
	summary: "Create branch context from a saved plan.",
	description: "Create a branch context entry from a saved plan file for agent implementation.",
	schema: createRequestSchema,
	resultSchema: branchContextResultSchema,
	handler: handleCreate,
});

export default defineExtension({
	commands: [branchContextFromPlanSdlCommand],
});
