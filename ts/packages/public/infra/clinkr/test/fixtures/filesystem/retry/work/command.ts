import { defineCommand, ok } from "@nseng-ai/clinkr";
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import { z } from "zod";

import { nextAttempt } from "../state.ts";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Retry fixture." };
}

export async function command() {
	if (nextAttempt() === 1) throw new Error("first definition failed");
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		handler: async () => ok({ value: "recovered" }),
		renderHuman: (result) => result.value,
	});
}
