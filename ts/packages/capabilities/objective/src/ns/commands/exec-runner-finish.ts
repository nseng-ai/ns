import { createSdlDomainCommand } from "@ns/capability-kit/ns-command";
import { defineExtension, type SdlCommand } from "@ns/kernel/sdk";

import {
	runnerFinishRequestSchema,
	runnerFinishResultSchema,
	runRunnerFinish,
	type RunnerFinishResult,
} from "../../runner/finish.ts";
import { createSdlObjectiveRunnerCoreContext } from "../runner-context.ts";

const RUNNER_FINISH_DESCRIPTION =
	"Validate the subagent report, run the verification gate, create the runner-owned commit, and emit the Runner Checkpoint for one decomposed Objective Runner step (ADR 0024).";

/**
 * Pi-free finish bookend. Renderers return the checkpoint verbatim for exit-0
 * states; non-ok checkpoint exits use runner-local stdout emission for
 * human/markdown modes and suppress it in JSON mode, matching the legacy
 * runner-step behavior until clinkr owns non-ok stdout artifacts structurally.
 */
export const objectiveExecRunnerFinishSdlCommand: SdlCommand<
	typeof runnerFinishRequestSchema,
	RunnerFinishResult
> = createSdlDomainCommand({
	name: "exec-runner-finish",
	summary: RUNNER_FINISH_DESCRIPTION,
	description: RUNNER_FINISH_DESCRIPTION,
	schema: runnerFinishRequestSchema,
	resultSchema: runnerFinishResultSchema,
	positionals: { slug: { position: 0 } },
	createContext: createSdlObjectiveRunnerCoreContext,
	handler: runRunnerFinish,
	renderHuman: (result) => result.checkpointMarkdown,
	renderMarkdown: (result) => result.checkpointMarkdown,
});

export default defineExtension({
	commands: [objectiveExecRunnerFinishSdlCommand],
});
