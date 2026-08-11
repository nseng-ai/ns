import { defineCommand } from "@nseng-ai/sdk";

import { gtFreeStackOptionSpecs } from "../../../../../core/command-options.ts";
import {
	gtFreeStackRequestSchema,
	gtFreeStackResultSchema,
	renderGtFreeStack,
	runGtFreeStack,
} from "../../../../../lifecycle/operations/gt/free-stack.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "free-stack",
		summary: "Release every assigned slot in the current Graphite stack except the current branch.",
		description:
			"Release every assigned slot in the current Graphite stack except the current branch.",
		schema: gtFreeStackRequestSchema,
		options: gtFreeStackOptionSpecs,
		resultSchema: gtFreeStackResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runGtFreeStack(await createSlotCliContext(ctx), request)),
		renderHuman: renderGtFreeStack,
	});
}
