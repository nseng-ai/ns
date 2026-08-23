import type { ClinkrCommandDefinition } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { z } from "zod";

import {
	runnerFinishRequestSchema,
	runnerFinishResultSchema,
	runRunnerFinish,
	type RunnerFinishResult,
} from "../../../../runner/finish.ts";
import type { ArgumentUsageErrorData } from "../../../../runner/preconditions.ts";
import { objectiveNsCommandWithContext } from "../../../objective-command.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../runner-context.ts";

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
	return objectiveNsCommandWithContext({
		schema: runnerFinishRequestSchema,
		resultSchema: runnerFinishResultSchema,
		negativeSchema: runnerFinishResultSchema,
		failureSchema: runnerFinishResultSchema,
		usageErrorSchema: z.any(),
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: runRunnerFinish,
		renderHuman: (result) => result.checkpointMarkdown,
		renderMarkdown: (result) => result.checkpointMarkdown,
	});
}
