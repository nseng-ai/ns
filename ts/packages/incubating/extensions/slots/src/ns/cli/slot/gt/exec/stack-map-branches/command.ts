import { defineCommand } from "@nseng-ai/sdk";

import {
	gtStackMapBranchesRequestSchema,
	gtStackMapBranchesResultSchema,
	renderStackMapBranches,
	runGtStackMapBranches,
} from "../../../../../../lifecycle/operations/gt/exec/stack-map-branches.ts";
import { createSlotCliContext } from "../../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "stack-map-branches",
		summary: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
		description: "Emit a Graphite branch graph and slot rows for stack-map skill/agent invocation.",
		schema: gtStackMapBranchesRequestSchema,
		resultSchema: gtStackMapBranchesResultSchema,
		handler: async (ctx, request) =>
			runGtStackMapBranches(await createSlotCliContext(ctx), request),
		renderHuman: renderStackMapBranches,
	});
}
