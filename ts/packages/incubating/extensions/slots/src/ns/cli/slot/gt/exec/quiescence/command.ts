import { defineCommand } from "@nseng-ai/sdk";

import {
	gtQuiescenceRequestSchema,
	gtQuiescenceResultSchema,
	renderGtQuiescence,
	runGtQuiescence,
} from "../../../../../../lifecycle/operations/gt/exec/quiescence.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "quiescence",
		summary: "Preflight whether the current Graphite stack scope is safe to mutate.",
		description: "Preflight whether the current Graphite stack scope is safe to mutate.",
		schema: gtQuiescenceRequestSchema,
		resultSchema: gtQuiescenceResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runGtQuiescence(await createSlotCliContext(ctx), request)),
		renderHuman: renderGtQuiescence,
	});
}
