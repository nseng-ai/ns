import { defineExtension } from "@nseng-ai/kernel/sdk";

import { handoffNsCommand } from "../command.ts";
import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "../../core/operations/gc.ts";

export const handoffGcNsCommand = handoffNsCommand({
	name: "gc",
	summary: "Garbage-collect handoffs for deleted branches.",
	description: "Delete handoffs whose local branch no longer exists.",
	schema: gcRequestSchema,
	options: { dryRun: { short: "-n" }, force: { short: "-f" } },
	resultSchema: gcResultSchema,
	handler: runGc,
	renderHuman: renderGc,
});

export default defineExtension({
	commands: [handoffGcNsCommand],
});
