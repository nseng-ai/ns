import { cliOption, cliPositional, defineCommand, failure } from "@nseng-ai/clinkr/app";
import { z } from "zod";
import type { GitplaneCliContext } from "../../context.ts";
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: z.object({
			commit: cliPositional(z.string(), { position: 0, description: "Target commit." }),
			full: cliOption(z.boolean().default(false), {
				short: "-f",
				description: "Perform a full reconciliation.",
			}),
		}),
		resultSchema: z.object({ available: z.literal(false) }),
		handler: async (_context: GitplaneCliContext, request) =>
			failure(
				"command-unavailable",
				"gitplane reconcile is not available in this implementation slice.",
				{ command: "reconcile", commit: request.commit, full: request.full },
			),
	});
}
