import { objectiveNsCommand } from "../../../objective-command.ts";
import {
	renderRunnerBegin,
	runnerBeginRequestSchema,
	runnerBeginResultSchema,
	runRunnerBegin,
} from "../../../../runner/begin.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../runner-context.ts";

export async function command() {
	return objectiveNsCommand({
		schema: runnerBeginRequestSchema,
		resultSchema: runnerBeginResultSchema,
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: runRunnerBegin,
		renderHuman: renderRunnerBegin,
		renderMarkdown: renderRunnerBegin,
	});
}
