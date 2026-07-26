import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		handler: async () => ok({ value: "secret" }),
		renderHuman: (result) => result.value,
	});
}
