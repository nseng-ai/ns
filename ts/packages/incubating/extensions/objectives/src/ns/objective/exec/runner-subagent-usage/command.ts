import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command() {
	const [{ objectiveNsCommand }, operation] = await Promise.all([
		import("../../../objective-command.ts"),
		import("../../../../core/operations/runner-subagent-usage.ts"),
	]);
	return objectiveNsCommand({
		schema: operation.runnerSubagentUsageRequestSchema,
		resultSchema: operation.runnerSubagentUsageResultSchema,
		usageErrorSchema: operation.runnerSubagentUsageResultSchema,
		positionals: { sessionFiles: { position: 0 } },
		handler: operation.runRunnerSubagentUsage,
		renderHuman: operation.renderRunnerSubagentUsageMarkdown,
		renderMarkdown: operation.renderRunnerSubagentUsageMarkdown,
	});
}

const COMMAND_DESCRIPTION =
	"Summarize Pi runner subagent JSONL usage telemetry for Objective stack digests.";
