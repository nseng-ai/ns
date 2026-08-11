import { defineCommand } from "@nseng-ai/sdk";

import { gcOptionSpecs } from "../../../../core/command-options.ts";
import {
	gcRequestSchema,
	gcResultSchema,
	renderGc,
	runGc,
} from "../../../../lifecycle/operations/gc.ts";
import { createSlotCliContext } from "../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "gc",
		summary: "Free slots whose pull requests have closed or merged.",
		description: "Free slots whose pull requests have closed or merged.",
		schema: gcRequestSchema,
		options: gcOptionSpecs,
		resultSchema: gcResultSchema,
		handler: async (ctx, request) => runGc(await createSlotCliContext(ctx), request),
		renderHuman: renderGc,
	});
}
