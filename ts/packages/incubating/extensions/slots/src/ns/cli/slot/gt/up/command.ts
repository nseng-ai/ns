import { defineCommand } from "@nseng-ai/sdk";

import { gtNavigationOptionSpecs } from "../../../../../core/command-options.ts";
import {
	gtNavigationResultSchema,
	gtUpRequestSchema,
	renderGtUpNavigation,
	runGtUp,
} from "../../../../../lifecycle/operations/gt/up.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "up",
		summary: "Print/copy a cd command for the immediate upstack Graphite branch.",
		description: "Print/copy a cd command for the immediate upstack Graphite branch.",
		schema: gtUpRequestSchema,
		options: gtNavigationOptionSpecs,
		resultSchema: gtNavigationResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runGtUp(await createSlotCliContext(ctx), request)),
		renderHuman: renderGtUpNavigation,
	});
}
