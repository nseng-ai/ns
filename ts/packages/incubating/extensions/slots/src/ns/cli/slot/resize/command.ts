import { defineCommand } from "@nseng-ai/sdk";

import { sizeOptionSpecs } from "../../../../core/command-options.ts";
import {
	renderResize,
	resizeRequestSchema,
	resizeResultSchema,
	runResize,
} from "../../../../lifecycle/operations/resize.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "resize",
		summary: "Grow or shrink the worktree pool to --size slots.",
		description: "Grow or shrink the worktree pool to --size slots.",
		schema: resizeRequestSchema,
		options: sizeOptionSpecs,
		resultSchema: resizeResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runResize(await createSlotCliContext(ctx), request)),
		renderHuman: renderResize,
	});
}
