import { defineCommand } from "@nseng-ai/sdk";

import {
	listRequestSchema,
	listResultSchema,
	renderList,
	runList,
} from "../../../../lifecycle/operations/list.ts";
import { createSlotCliContext } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "list",
		summary: "List worktree pool slots derived from Git worktree state.",
		description: "List worktree pool slots derived from Git worktree state.",
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: async (ctx, request) => runList(await createSlotCliContext(ctx), request),
		renderHuman: renderList,
	});
}
