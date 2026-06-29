import { branchContextCommand } from "../command.ts";
import { handleLoad, loadPlanResultSchema, loadRequestSchema } from "../../operations.ts";

export const branchContextLoadSdlCommand = branchContextCommand({
	name: "load",
	summary: "Load an attached branch-context plan.",
	description:
		"Load a branch-context entry and render the implementation prompt for agent invocation.",
	schema: loadRequestSchema,
	resultSchema: loadPlanResultSchema,
	positionals: { key: { position: 0 } },
	handler: handleLoad,
});
