import { defineCommand } from "@nseng-ai/sdk";

import {
	gtDescendantsReportRequestSchema,
	gtDescendantsReportResultSchema,
	renderGtDescendantsReport,
	runGtDescendantsReport,
} from "../../../../../../lifecycle/operations/gt/exec/descendants-report.ts";
import { createSlotCliContext } from "../../../../../command-adapter.ts";

export async function command() {
	return defineCommand({
		name: "descendants-report",
		summary: "Emit complete descendant topology, Git evidence, and best-effort PR metadata.",
		description:
			"Inspect a named local branch's complete Graphite descendant subtree without requiring checkout.",
		schema: gtDescendantsReportRequestSchema,
		positionals: { branch: { position: 0 } },
		resultSchema: gtDescendantsReportResultSchema,
		handler: async (ctx, request) =>
			runGtDescendantsReport(await createSlotCliContext(ctx), request),
		renderHuman: renderGtDescendantsReport,
	});
}
