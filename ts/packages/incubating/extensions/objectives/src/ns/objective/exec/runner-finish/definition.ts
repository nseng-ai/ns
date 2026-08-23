import { z } from "zod";

import { objectiveNsCommand } from "../../../objective-command.ts";
import {
	runnerFinishRequestSchema,
	runnerFinishResultSchema,
	runRunnerFinish,
} from "../../../../runner/finish.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../runner-context.ts";

export async function command() {
	return objectiveNsCommand({
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
