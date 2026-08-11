import { defineCommand } from "@nseng-ai/sdk";

import { gotoOptionSpecs } from "../../../../core/command-options.ts";
import {
	gotoRequestSchema,
	gotoResultSchema,
	renderGoto,
	runGoto,
} from "../../../../lifecycle/operations/goto.ts";
import { createSlotCliContext } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "goto",
		summary: "Print/copy a cd command for a slot worktree.",
		description: "Print/copy a cd command for a slot worktree.",
		schema: gotoRequestSchema,
		options: gotoOptionSpecs,
		resultSchema: gotoResultSchema,
		handler: async (ctx, request) => runGoto(await createSlotCliContext(ctx), request),
		renderHuman: renderGoto,
	});
}
