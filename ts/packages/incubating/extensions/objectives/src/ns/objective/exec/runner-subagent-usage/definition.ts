import { objectiveNsCommand } from "../../../objective-command.ts";
import {
	renderRunnerSubagentUsageMarkdown,
	runnerSubagentUsageRequestSchema,
	runnerSubagentUsageResultSchema,
	runRunnerSubagentUsage,
} from "../../../../core/operations/runner-subagent-usage.ts";

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
