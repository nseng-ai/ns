import type { ClinkrCommandDefinition } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { z } from "zod";

import {
	renderRunnerBegin,
	runnerBeginRequestSchema,
	runnerBeginResultSchema,
	runRunnerBegin,
	type RunnerBeginFailureData,
	type RunnerBeginResult,
} from "../../../../runner/begin.ts";
import type { ArgumentUsageErrorData } from "../../../../runner/preconditions.ts";
import { objectiveNsCommandWithContext } from "../../../objective-command.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../runner-context.ts";

export async function command(): Promise<
	ClinkrCommandDefinition<
		NsExtensionApi,
		typeof runnerBeginRequestSchema,
		RunnerBeginResult,
		RunnerBeginResult,
		RunnerBeginFailureData,
		ArgumentUsageErrorData
	>
> {
	return objectiveNsCommandWithContext({
		schema: runnerBeginRequestSchema,
		resultSchema: runnerBeginResultSchema,
		failureSchema: z.any(),
		usageErrorSchema: z.any(),
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: runRunnerBegin,
		renderHuman: renderRunnerBegin,
		renderMarkdown: renderRunnerBegin,
	});
}
