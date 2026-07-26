import { objectiveCommandMetadata, objectiveNsCommand } from "../../../objective-command.ts";
import {
	runnerFinishRequestSchema,
	runnerFinishResultSchema,
	runRunnerFinish,
} from "../../../../runner/finish.ts";
import { createNsObjectiveRunnerCoreContext } from "../../../runner-context.ts";

const DESCRIPTION =
	"Validate the subagent report, run the verification gate, create the runner-owned commit, and emit the Runner Checkpoint for one decomposed Objective Runner step (ADR 0024).";

export function metadata() {
	return objectiveCommandMetadata(DESCRIPTION);
}

export async function command() {
	return objectiveNsCommand({
		schema: runnerFinishRequestSchema,
		resultSchema: runnerFinishResultSchema,
		positionals: { slug: { position: 0 } },
		createContext: createNsObjectiveRunnerCoreContext,
		handler: runRunnerFinish,
		renderHuman: (result) => result.checkpointMarkdown,
		renderMarkdown: (result) => result.checkpointMarkdown,
	});
}
