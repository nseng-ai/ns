import type { ClinkrCommandDefinition, ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import type { runnerFinishRequestSchema, RunnerFinishResult } from "../../../../runner/finish.ts";
import type { ArgumentUsageErrorData } from "../../../../runner/preconditions.ts";

export function metadata(): ClinkrCommandMetadata {
	return { description: COMMAND_DESCRIPTION };
}

export async function command(): Promise<
	ClinkrCommandDefinition<
		NsExtensionApi,
		typeof runnerFinishRequestSchema,
		RunnerFinishResult,
		RunnerFinishResult,
		RunnerFinishResult,
		ArgumentUsageErrorData
	>
> {
	const [{ z }, { objectiveNsCommand }, operation, { createNsObjectiveRunnerCoreContext }] =
		await Promise.all([
			import("zod"),
			import("../../../objective-command.ts"),
			import("../../../../runner/finish.ts"),
			import("../../../runner-context.ts"),
		]);
	return objectiveNsCommand({
		schema: operation.runnerFinishRequestSchema,
		resultSchema: operation.runnerFinishResultSchema,
		negativeSchema: operation.runnerFinishResultSchema,
		failureSchema: operation.runnerFinishResultSchema,
		usageErrorSchema: z.any(),
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: operation.runRunnerFinish,
		renderHuman: (result) => result.checkpointMarkdown,
		renderMarkdown: (result) => result.checkpointMarkdown,
	});
}

const COMMAND_DESCRIPTION =
	"Validate the subagent report, run the verification gate, create the runner-owned commit, and emit the Runner Checkpoint for one decomposed Objective Runner step (ADR 0024).";
