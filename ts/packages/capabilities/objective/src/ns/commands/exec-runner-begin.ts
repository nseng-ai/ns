import { createNsDomainCommand } from "@nseng-ai/capability-kit/ns-command";
import { defineExtension, type NsCommand } from "@nseng-ai/kernel/sdk";

import {
	renderRunnerBegin,
	runnerBeginRequestSchema,
	runnerBeginResultSchema,
	runRunnerBegin,
	type RunnerBeginResult,
} from "../../runner/begin.ts";
import { createNsObjectiveRunnerCoreContext } from "../runner-context.ts";

const RUNNER_BEGIN_DESCRIPTION =
	"Check preconditions and emit step facts plus the subagent prompt for one decomposed Objective Runner step (ADR 0024).";

/**
 * Pi-free begin bookend: unlike the legacy `exec-runner-step` this is a plain
 * command constant — no child-session composition seam is needed because the
 * parent harness owns dispatch.
 */
export const objectiveExecRunnerBeginNsCommand: NsCommand<
	typeof runnerBeginRequestSchema,
	RunnerBeginResult
> = createNsDomainCommand({
	name: "exec-runner-begin",
	summary: RUNNER_BEGIN_DESCRIPTION,
	description: RUNNER_BEGIN_DESCRIPTION,
	schema: runnerBeginRequestSchema,
	resultSchema: runnerBeginResultSchema,
	positionals: { slug: { position: 0 } },
	createContext: createNsObjectiveRunnerCoreContext,
	handler: runRunnerBegin,
	renderHuman: renderRunnerBegin,
	renderMarkdown: renderRunnerBegin,
});

export default defineExtension({
	commands: [objectiveExecRunnerBeginNsCommand],
});
