import { cliOption, cliPositional, defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

export async function command() {
	return defineCommand({
		schema: z.object({
			query: cliPositional(z.string(), {
				position: 0,
				description: "Search query.",
			}),
			paths: cliPositional(z.array(z.string()), {
				position: 1,
				description: "Paths to search.",
			}),
			limit: cliOption(z.int().default(20), {
				short: "-n",
				description: "Maximum matches.",
			}),
			mode: cliOption(z.enum(["exact", "fuzzy"]).default("exact"), {
				description: "Matching mode.",
			}),
			tag: cliOption(z.array(z.string()).default([]), {
				description: "Tag filter.",
			}),
		}),
		resultSchema: z.object({
			query: z.string(),
			paths: z.array(z.string()),
			limit: z.int(),
			mode: z.enum(["exact", "fuzzy"]),
			tag: z.array(z.string()),
		}),
		handler: async (request) => ok(request),
	});
}
