import { defineExtension } from "@sdl/kernel/sdk";

import { objectiveSdlCommand } from "../command.ts";
import {
	renderRunnerSubagentUsageMarkdown,
	runnerSubagentUsageRequestSchema,
	runnerSubagentUsageResultSchema,
	runRunnerSubagentUsage,
} from "../../core/operations/runner-subagent-usage.ts";

export const objectiveExecRunnerSubagentUsageSdlCommand = objectiveSdlCommand({
	name: "exec-runner-subagent-usage",
	summary: "Summarize Pi runner subagent JSONL usage telemetry for Objective stack digests.",
	description: "Summarize Pi runner subagent JSONL usage telemetry for Objective stack digests.",
	schema: runnerSubagentUsageRequestSchema,
	resultSchema: runnerSubagentUsageResultSchema,
	positionals: { sessionFiles: { position: 0 } },
	handler: runRunnerSubagentUsage,
	renderHuman: renderRunnerSubagentUsageMarkdown,
	renderMarkdown: renderRunnerSubagentUsageMarkdown,
});

export default defineExtension({
	commands: [objectiveExecRunnerSubagentUsageSdlCommand],
});
