import { defineCommand } from "@nseng-ai/sdk";

import { freeOptionSpecs } from "../../../../core/command-options.ts";
import {
	freeRequestSchema,
	freeResultSchema,
	renderFree,
	runFree,
} from "../../../../lifecycle/operations/free.ts";
import { createSlotCliContext } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "free",
		summary: "Free assigned slots back to the pool.",
		description: "Free assigned slots back to the pool.",
		schema: freeRequestSchema,
		options: freeOptionSpecs,
		resultSchema: freeResultSchema,
		handler: async (ctx, request) => runFree(await createSlotCliContext(ctx), request),
		renderHuman: renderFree,
	});
}
