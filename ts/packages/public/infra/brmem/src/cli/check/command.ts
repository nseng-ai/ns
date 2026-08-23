import { defineCommand } from "@nseng-ai/clinkr";

import {
	checkRequestSchema,
	checkResultSchema,
	renderCheck,
	runCheck,
} from "../../operations/check.ts";

export async function command() {
	return defineCommand({
		schema: checkRequestSchema,
		positionals: { key: { position: 0 } },
		options: { require: { short: "-r" } },
		resultSchema: checkResultSchema,
		negativeSchema: checkResultSchema,
		handler: runCheck,
		renderHuman: renderCheck,
	});
}
