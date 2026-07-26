import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

import { recordLoad } from "../log.ts";

recordLoad("first:command-module");

export async function command() {
	recordLoad("first:command-call");
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		handler: async () => {
			recordLoad("first:handler");
			return ok({ value: "first" });
		},
		renderHuman: (result) => result.value,
	});
}
