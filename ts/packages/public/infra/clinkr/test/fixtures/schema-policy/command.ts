import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

import { requests } from "./support.ts";

export async function command() {
	return defineCommand({
		schema: z
			.object({
				name: z
					.string()
					.default("Ada")
					.transform((name) => name.toUpperCase()),
				nested: z.object({ value: z.number() }).passthrough(),
			})
			.passthrough(),
		handler: async (request) => {
			requests.push(request);
			return ok();
		},
	});
}
