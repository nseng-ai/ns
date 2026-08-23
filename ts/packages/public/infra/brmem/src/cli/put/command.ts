import { defineCommand } from "@nseng-ai/clinkr";

import { putRequestSchema, putResultSchema, renderPut, runPut } from "../../operations/put.ts";

export async function command() {
	return defineCommand({
		schema: putRequestSchema,
		positionals: { key: { position: 0 } },
		options: { force: { short: "-f" } },
		resultSchema: putResultSchema,
		handler: runPut,
		renderHuman: renderPut,
	});
}
