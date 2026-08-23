import { defineCommand } from "@nseng-ai/clinkr";

import { gcRequestSchema, gcResultSchema, renderGc, runGc } from "../../operations/gc.ts";

export async function command() {
	return defineCommand({
		schema: gcRequestSchema,
		options: { yes: { short: "-y" } },
		resultSchema: gcResultSchema,
		handler: runGc,
		renderHuman: renderGc,
	});
}
