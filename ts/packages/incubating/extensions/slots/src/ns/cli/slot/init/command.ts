import { defineCommand } from "@nseng-ai/sdk";

import { sizeOptionSpecs } from "../../../../core/command-options.ts";
import {
	initRequestSchema,
	initResultSchema,
	renderInit,
	runInit,
} from "../../../../lifecycle/operations/init.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "init",
		summary: "Initialize the worktree pool with N detached slots at trunk.",
		description: "Initialize the worktree pool with N detached slots at trunk.",
		schema: initRequestSchema,
		options: sizeOptionSpecs,
		resultSchema: initResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runInit(await createSlotCliContext(ctx), request)),
		renderHuman: renderInit,
	});
}
