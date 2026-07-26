import { defineCommand } from "@nseng-ai/clinkr";
import { z } from "zod";

import {
	deleteRequestSchema,
	deleteResultSchema,
	renderDelete,
	runDelete,
} from "../../operations/delete.ts";

export async function command() {
	return defineCommand({
		schema: deleteRequestSchema,
		positionals: { key: { position: 0 } },
		options: { yes: { short: "-y" } },
		resultSchema: deleteResultSchema,
		negativeSchema: deleteResultSchema.extend({ message: z.string() }),
		usageErrorSchema: z.unknown(),
		handler: runDelete,
		renderHuman: renderDelete,
	});
}
