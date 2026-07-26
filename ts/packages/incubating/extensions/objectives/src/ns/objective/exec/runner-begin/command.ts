import { objectiveCommandMetadata, objectiveNsCommand } from "../../../objective-command.ts";
import {
	renderRunnerBegin,
	runnerBeginRequestSchema,
	runnerBeginResultSchema,
	runRunnerBegin,
} from "../../../../runner/begin.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../runner-context.ts";

const DESCRIPTION =
	"Check preconditions and emit step facts plus the subagent prompt for one decomposed Objective Runner step (ADR 0024).";

export function metadata() {
	return objectiveCommandMetadata(DESCRIPTION);
}

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
