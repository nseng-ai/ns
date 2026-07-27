import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

import { counter } from "./counter.ts";

export async function command() {
	return defineCommand({
		schema: z.object({}),
		handler: async () => {
			counter.handlerCalls += 1;
			return ok();
		},
	});
}
