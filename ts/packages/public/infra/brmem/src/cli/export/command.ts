import { defineCommand } from "@nseng-ai/clinkr";

import {
	exportRequestSchema,
	exportResultSchema,
	renderExport,
	runExport,
} from "../../operations/export.ts";

export async function command() {
	return defineCommand({
		schema: exportRequestSchema,
		resultSchema: exportResultSchema,
		handler: runExport,
		renderHuman: renderExport,
	});
}
