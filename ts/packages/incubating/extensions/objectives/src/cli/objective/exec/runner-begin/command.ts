import {
	renderRunnerBegin,
	runnerBeginRequestSchema,
	runnerBeginResultSchema,
	runRunnerBegin,
} from "../../../../runner/begin.ts";
import { objectiveNsCommandWithContext } from "../../../../ns/objective-command.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../../ns/runner-context.ts";

export async function command() {
	return objectiveNsCommandWithContext({
		schema: runnerBeginRequestSchema,
		resultSchema: runnerBeginResultSchema,
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: runRunnerBegin,
		renderHuman: renderRunnerBegin,
		renderMarkdown: renderRunnerBegin,
	});
}
