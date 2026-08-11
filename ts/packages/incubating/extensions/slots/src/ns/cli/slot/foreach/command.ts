import { defineCommand } from "@nseng-ai/sdk";

import { foreachOptionSpecs } from "../../../../core/command-options.ts";
import {
	foreachRequestSchema,
	foreachResultSchema,
	renderForeach,
	runForeach,
} from "../../../../lifecycle/operations/foreach.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "foreach",
		summary: "Run a command in every managed slot worktree.",
		description: "Run a command in every managed slot worktree.",
		schema: foreachRequestSchema,
		positionals: { command: { position: 0 } },
		options: foreachOptionSpecs,
		resultSchema: foreachResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runForeach(await createSlotCliContext(ctx), request), {
				useHumanOverride: ctx.outputFormat === undefined || ctx.outputFormat === "human",
			}),
		renderHuman: renderForeach,
	});
}
