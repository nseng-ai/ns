import { defineCommand } from "@nseng-ai/sdk";

import {
	gtRestackPreflightRequestSchema,
	gtRestackPreflightResultSchema,
	renderGtRestackPreflight,
	runGtRestackPreflight,
} from "../../../../../../lifecycle/operations/gt/exec/restack-preflight.ts";
import { createSlotCliContext, toModernSlotOutcome } from "../../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "restack-preflight",
		summary: "Emit deterministic Git, Graphite, and Slot facts before a restack.",
		description:
			"Inspect the current worktree and requested Graphite stack scope without mutating either.",
		schema: gtRestackPreflightRequestSchema,
		resultSchema: gtRestackPreflightResultSchema,
		handler: async (ctx, request) =>
			toModernSlotOutcome(await runGtRestackPreflight(await createSlotCliContext(ctx), request)),
		renderHuman: renderGtRestackPreflight,
	});
}
