/**
 * ADR0024-LEGACY-DELETE(whole file): the legacy blocking command surface.
 * Deleting it also requires removing its non-commentable registrations:
 * the `"./sdl/commands/exec-runner-step"` entry in this package's
 * package.json `exports`, the `exec-runner-step` entry in
 * `.ns/extensions/objective/package.json`, and the stub
 * `.ns/extensions/objective/src/commands/exec-runner-step.ts`.
 */
import { createSdlDomainCommand } from "@ji/capability-kit/ji-command";
import { usageError } from "@ji/clinkr";
import { optionalEntry } from "@ji/core/primitives";
import { systemClock, systemTimerScheduler } from "@ji/core/time";
import { defineExtension, type SdlCommand } from "@ji/kernel/sdk";

// jiti constraint: import the adapter by its concrete module path, never via
// the src/pi/index.ts barrel — the barrel re-exports extension.ts and would
// pull the optional @ji/pi peer into this command's transpile graph.
import { createPiChildSessionGateway } from "../../pi/child-session/pi-child-session-gateway.ts";
import {
	runnerStepRequestSchema,
	runnerStepResultSchema,
	runRunnerStep,
	type RunnerStepResult,
} from "../../runner/step.ts";
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
 * gateway); the wired default export below composes the real Pi adapter.
 * Renderers return the checkpoint verbatim for exit-0 states. Non-ok checkpoint
 * exits still use runner-local stdout emission for human/markdown modes, but
 * suppress that stream in JSON mode so the machine envelope remains valid until
 * clinkr owns non-ok stdout artifacts structurally.
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
			const stepRequest = { ...request, ...optionalEntry("guidance", guidance.guidance) };
			return runRunnerStep(ctx, stepRequest);
		},
		renderHuman: (result) => result.checkpointMarkdown,
		renderMarkdown: (result) => result.checkpointMarkdown,
	});
}

/** Live command: the factory composed with the real Pi child-session adapter. */
export const objectiveExecRunnerStepSdlCommand = createObjectiveExecRunnerStepSdlCommand({
	createChildSessionGateway: ({ env }) =>
		createPiChildSessionGateway({ env, clock: systemClock, timers: systemTimerScheduler }),
});

export default defineExtension({
	commands: [objectiveExecRunnerStepSdlCommand],
});
