import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

export async function command() {
	return defineCommand({
		schema: z.object({ name: z.string().default("Ada") }),
		resultSchema: z.object({ name: z.string().transform((name) => name.toUpperCase()) }),
		renderHuman: (result, capabilities) =>
			`${capabilities.canEmitAnsi ? "ansi" : "plain"}:${result.name}`,
		handler: async (request) => ok({ name: request.name }),
	});
}
