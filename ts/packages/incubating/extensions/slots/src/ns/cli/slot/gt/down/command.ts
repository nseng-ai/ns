import { defineCommand } from "@nseng-ai/sdk";

import { gtNavigationOptionSpecs } from "../../../../../core/command-options.ts";
import {
	gtDownRequestSchema,
	gtDownResultSchema,
	renderGtDownNavigation,
	runGtDown,
} from "../../../../../lifecycle/operations/gt/down.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "down",
		summary: "Print/copy a cd command for the immediate downstack Graphite branch.",
		description: "Print/copy a cd command for the immediate downstack Graphite branch.",
		schema: gtDownRequestSchema,
		options: gtNavigationOptionSpecs,
		resultSchema: gtDownResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runGtDown(await createSlotCliContext(ctx), request)),
		renderHuman: renderGtDownNavigation,
	});
}
