import { defineCommand } from "@nseng-ai/sdk";

import {
	gtStackBranchesRequestSchema,
	gtStackBranchesResultSchema,
	renderStackBranches,
	runGtStackBranches,
} from "../../../../../../lifecycle/operations/gt/exec/stack-branches.ts";
import { createSlotCliContext } from "../../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "stack-branches",
		summary: "Emit the current Graphite stack branch list for skill/agent invocation.",
		description: "Emit the current Graphite stack branch list for skill/agent invocation.",
		schema: gtStackBranchesRequestSchema,
		resultSchema: gtStackBranchesResultSchema,
		handler: async (ctx, request) => runGtStackBranches(await createSlotCliContext(ctx), request),
		renderHuman: renderStackBranches,
	});
}
