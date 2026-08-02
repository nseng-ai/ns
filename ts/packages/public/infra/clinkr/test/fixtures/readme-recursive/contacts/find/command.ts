import { cliOption, cliPositional, defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

export async function command() {
	return defineCommand({
		schema: z.object({
			name: cliPositional(z.string(), { position: 0, description: "Contact name." }),
			includeArchived: cliOption(z.boolean().default(false), {
				short: "-a",
				description: "Include archived contacts.",
			}),
			limit: cliOption(z.number().int().positive().default(20), {
				short: "-n",
				description: "Maximum matches.",
			}),
		}),
		resultSchema: z.object({ matches: z.array(z.string()) }),
		handler: (request) =>
			ok({
				matches: request.includeArchived
					? [`${request.name} (archived)`, request.name].slice(0, request.limit)
					: [request.name].slice(0, request.limit),
			}),
		renderHuman: (result) => result.matches.join("\n"),
	});
}
