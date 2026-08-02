import { defineCommand, failure } from "@nseng-ai/clinkr/app";
import { z } from "zod";
import type { GitplaneCliContext } from "../../context.ts";
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: z.object({}),
		resultSchema: z.object({ available: z.literal(false) }),
		handler: async (_context: GitplaneCliContext) =>
			failure(
				"command-unavailable",
				"gitplane doctor is not available in this implementation slice.",
				{ command: "doctor" },
			),
	});
}
