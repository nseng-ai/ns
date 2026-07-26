import { defineCommand, ok } from "@nseng-ai/clinkr";
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import { z } from "zod";

import { recordLoad } from "../log.ts";

export function metadata(): ClinkrCommandMetadata {
	recordLoad("first:metadata");
	return { description: "First." };
}

export async function command() {
	recordLoad("first:command");
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		handler: async () => ok({ value: "first" }),
		renderHuman: (result) => result.value,
	});
}
