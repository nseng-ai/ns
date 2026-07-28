import { defineCommand, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";

export async function command() {
	return defineCommand({
		schema: z
			.strictObject({ a: z.string().optional(), b: z.string().optional() })
			.refine((request) => request.a !== undefined || request.b !== undefined, {
				message: "a or b required",
			}),
		handler: async () => ok(),
	});
}
