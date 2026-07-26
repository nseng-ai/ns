import { objectiveCommandMetadata, objectiveNsCommand } from "../../../objective-command.ts";
import {
	renderRunnerSubagentUsageMarkdown,
	runnerSubagentUsageRequestSchema,
	runnerSubagentUsageResultSchema,
	runRunnerSubagentUsage,
} from "../../../../core/operations/runner-subagent-usage.ts";

export function metadata() {
	return objectiveCommandMetadata(
		"Summarize Pi runner subagent JSONL usage telemetry for Objective stack digests.",
	);
}

export async function command() {
	return objectiveNsCommand({
		schema: runnerSubagentUsageRequestSchema,
		resultSchema: runnerSubagentUsageResultSchema,
		positionals: { sessionFiles: { position: 0 } },
		handler: runRunnerSubagentUsage,
		renderHuman: renderRunnerSubagentUsageMarkdown,
		renderMarkdown: renderRunnerSubagentUsageMarkdown,
	});
}
