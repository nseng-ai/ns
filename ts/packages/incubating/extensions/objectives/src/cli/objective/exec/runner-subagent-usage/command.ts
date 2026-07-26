import {
	renderRunnerSubagentUsageMarkdown,
	runnerSubagentUsageRequestSchema,
	runnerSubagentUsageResultSchema,
	runRunnerSubagentUsage,
} from "../../../../core/operations/runner-subagent-usage.ts";
import { objectiveNsCommand } from "../../../../ns/objective-command.ts";

export async function command() {
	return objectiveNsCommand({
		schema: runnerSubagentUsageRequestSchema,
		resultSchema: runnerSubagentUsageResultSchema,
		usageErrorSchema: runnerSubagentUsageResultSchema,
		positionals: { sessionFiles: { position: 0 } },
		handler: runRunnerSubagentUsage,
		renderHuman: renderRunnerSubagentUsageMarkdown,
		renderMarkdown: renderRunnerSubagentUsageMarkdown,
	});
}
