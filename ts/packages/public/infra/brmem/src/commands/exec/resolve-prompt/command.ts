import { defineCommand } from "@nseng-ai/clinkr";

import {
	resolvePromptRequestSchema,
	resolvePromptResultSchema,
	renderResolvePrompt,
	runResolvePrompt,
} from "../../../operations/resolve-prompt.ts";

export async function command() {
	return defineCommand({
		schema: resolvePromptRequestSchema,
		positionals: { name: { position: 0 } },
		resultSchema: resolvePromptResultSchema,
		handler: runResolvePrompt,
		renderHuman: renderResolvePrompt,
	});
}
