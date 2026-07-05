import { defineExtension } from "@nseng-ai/kernel/sdk";

import { branchContextCommand } from "../command.ts";
import {
	branchContextResultSchema,
	createRequestSchema,
	handleCreate,
} from "../../core/operations.ts";

export const branchContextFromPlanNsCommand = branchContextCommand({
	name: "from-plan",
	summary: "Create branch context from a saved plan.",
	description: "Create a branch context entry from a saved plan file for agent implementation.",
	schema: createRequestSchema,
	resultSchema: branchContextResultSchema,
	handler: handleCreate,
});

export default defineExtension({
	commands: [branchContextFromPlanNsCommand],
});
