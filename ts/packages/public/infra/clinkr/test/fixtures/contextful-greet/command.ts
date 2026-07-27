import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

export interface GreetContext {
	readonly prefix: string;
}

export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: z.object({ name: z.string().default("Ada") }),
		resultSchema: z.object({ message: z.string() }),
		handler: async (context: GreetContext, request) =>
			ok({ message: `${context.prefix}${request.name}` }),
	});
}
