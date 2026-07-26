import { defineCommand } from "@nseng-ai/clinkr";

import { listRequestSchema, listResultSchema, renderList, runList } from "../../operations/list.ts";

export async function command() {
	return defineCommand({
		schema: listRequestSchema,
		resultSchema: listResultSchema,
		handler: runList,
		renderHuman: renderList,
	});
}
