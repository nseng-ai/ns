import { defineCommand, ok } from "@nseng-ai/clinkr";
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import { z } from "zod";

import { recordLoad } from "../log.ts";

export function metadata(): ClinkrCommandMetadata {
	recordLoad("second:metadata");
	return { description: "Second." };
}

export async function command() {
	recordLoad("second:command");
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		handler: async () => ok({ value: "second" }),
		renderHuman: (result) => result.value,
	});
}
