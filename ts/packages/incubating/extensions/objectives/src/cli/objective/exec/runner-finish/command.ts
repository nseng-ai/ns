import {
	runnerFinishRequestSchema,
	runnerFinishResultSchema,
	runRunnerFinish,
} from "../../../../runner/finish.ts";
import { objectiveNsCommandWithContext } from "../../../../ns/objective-command.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../../ns/runner-context.ts";

export async function command() {
	return objectiveNsCommandWithContext({
		schema: runnerFinishRequestSchema,
		resultSchema: runnerFinishResultSchema,
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: runRunnerFinish,
		renderHuman: (result) => result.checkpointMarkdown,
		renderMarkdown: (result) => result.checkpointMarkdown,
	});
}
