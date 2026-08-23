import { defineCommand } from "@nseng-ai/clinkr";

import { copyRequestSchema, copyResultSchema, renderCopy, runCopy } from "../../operations/copy.ts";

export async function command() {
	return defineCommand({
		schema: copyRequestSchema,
		resultSchema: copyResultSchema,
		negativeSchema: copyResultSchema,
		handler: runCopy,
		renderHuman: renderCopy,
	});
}
