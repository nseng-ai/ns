import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

import { recordLoad } from "../log.ts";

recordLoad("second:command-module");

export async function command() {
	recordLoad("second:command-call");
	return defineCommand({
		schema: z.object({}),
		resultSchema: z.object({ value: z.string() }),
		handler: async () => ok({ value: "second" }),
		renderHuman: (result) => result.value,
	});
}
