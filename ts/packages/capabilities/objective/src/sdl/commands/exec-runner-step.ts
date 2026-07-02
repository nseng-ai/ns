import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";
import { usageError } from "@sdl/clinkr";
import type { SdlCommand } from "@sdl/kernel/sdk";

import {
	runnerStepRequestSchema,
	runnerStepResultSchema,
	runRunnerStep,
	type RunnerStepResult,
} from "../../core/operations/runner-step.ts";
import { resolveGuidance } from "../../runner/guidance.ts";
import {
	createSdlObjectiveRunnerContext,
	type ObjectiveRunnerComposition,
} from "../runner-context.ts";

const RUNNER_STEP_DESCRIPTION =
	"Run one verified Objective implementation step through a dispatched child session and emit the Runner Checkpoint.";

/**
 * Factory for the `exec-runner-step` sdl command.
 *
 * The composition supplies the one Pi-coupled dependency (the child-session
 * gateway); the wired default export appears in Slice 5 with the real adapter.
 * Renderers return the checkpoint verbatim for exit-0 states; exit 1/2 states
 * already wrote the checkpoint to stdout inside the operation (ADR 0022:
 * the checkpoint is the only stdout in every terminal state).
 */
export function createObjectiveExecRunnerStepSdlCommand(
	composition: ObjectiveRunnerComposition,
): SdlCommand<typeof runnerStepRequestSchema, RunnerStepResult> {
	return createSdlDomainCommand({
		name: "exec-runner-step",
		summary: RUNNER_STEP_DESCRIPTION,
		description: RUNNER_STEP_DESCRIPTION,
		schema: runnerStepRequestSchema,
		resultSchema: runnerStepResultSchema,
		positionals: { slug: { position: 0 } },
		createContext: (ctx) => createSdlObjectiveRunnerContext(ctx, composition),
		handler: async (ctx, request) => {
			const guidance = await resolveGuidance({
				cwd: ctx.cwd,
				guidance: request.guidance,
				readTextFile: (path) => ctx.readTextFile(path),
			});
			if (guidance.type === "unreadable-file") {
				return usageError(`Could not read guidance file ${guidance.path}: ${guidance.message}`, {
					argument: "guidance",
				});
			}
			const stepRequest =
				guidance.guidance === undefined ? request : { ...request, guidance: guidance.guidance };
			return runRunnerStep(ctx, stepRequest);
		},
		renderHuman: (result) => result.checkpointMarkdown,
		renderMarkdown: (result) => result.checkpointMarkdown,
	});
}
