import { defineCommand } from "@nseng-ai/clinkr";

import { getRequestSchema, getResultSchema, renderGet, runGet } from "../../operations/get.ts";

export async function command() {
	return defineCommand({
		schema: getRequestSchema,
		positionals: { key: { position: 0 } },
		resultSchema: getResultSchema,
		negativeSchema: getResultSchema,
		handler: runGet,
		renderHuman: renderGet,
	});
}
