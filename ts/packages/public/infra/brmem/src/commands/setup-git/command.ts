import { defineCommand } from "@nseng-ai/clinkr";

import {
	renderSetupGit,
	runSetupGit,
	setupGitRequestSchema,
	setupGitResultSchema,
} from "../../operations/setup-git.ts";

export async function command() {
	return defineCommand({
		schema: setupGitRequestSchema,
		resultSchema: setupGitResultSchema,
		handler: runSetupGit,
		renderHuman: renderSetupGit,
	});
}
