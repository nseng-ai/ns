import { defineCommand, ok } from "@nseng-ai/clinkr";
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import { z } from "zod";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Default fixture command." };
}

export async function command() {
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		handler: async () => ok({ value: "default" }),
		renderHuman: (result) => result.value,
	});
}
