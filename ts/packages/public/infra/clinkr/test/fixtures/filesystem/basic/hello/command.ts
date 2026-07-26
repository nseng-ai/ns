import { defineCommand, ok } from "@nseng-ai/clinkr";
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import { z } from "zod";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Say hello.", aliases: ["hi"] };
}

export async function command() {
	return defineCommand({
		schema: z.object({ name: z.string().default("world").describe("Person to greet.") }),
		resultSchema: z.object({ greeting: z.string() }),
		handler: async (_context, request) => ok({ greeting: `Hello, ${request.name}.` }),
		renderHuman: (result) => result.greeting,
	});
}
