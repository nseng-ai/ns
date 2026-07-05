/**
 * ADR0024-LEGACY-DELETE(whole file): the legacy blocking command surface.
 * Deleting it also requires removing its non-commentable registrations:
 * the `"./ns/commands/exec-runner-step"` entry in this package's
 * package.json `exports`, the `exec-runner-step` entry in
 * `.ns/extensions/objective/package.json`, and the stub
 * `.ns/extensions/objective/src/commands/exec-runner-step.ts`.
 */
import { createNsDomainCommand } from "@ns/capability-kit/ns-command";
import { usageError } from "@ns/clinkr";
import { optionalEntry } from "@ns/core/primitives";
import { systemClock, systemTimerScheduler } from "@ns/core/time";
import { defineExtension, type NsCommand } from "@ns/kernel/sdk";

// jiti constraint: import the adapter by its concrete module path, never via
// the src/pi/index.ts barrel — the barrel re-exports extension.ts and would
// pull the optional @ns/pi peer into this command's transpile graph.
import { createPiChildSessionGateway } from "../../pi/child-session/pi-child-session-gateway.ts";
import {
	runnerStepRequestSchema,
	runnerStepResultSchema,
	runRunnerStep,
	type RunnerStepResult,
} from "../../runner/step.ts";
import { guidanceUsageProblem, resolveGuidance } from "../../runner/guidance.ts";
import {
	createNsObjectiveRunnerContext,
	type ObjectiveRunnerComposition,
} from "../runner-context.ts";

const RUNNER_STEP_DESCRIPTION =
	"Run one verified Objective implementation step through a dispatched child session and emit the Runner Checkpoint.";

/**
 * Factory for the `exec-runner-step` ns command.
 *
 * The composition supplies the one Pi-coupled dependency (the child-session
 * gateway); the wired default export below composes the real Pi adapter.
 * Renderers return the checkpoint verbatim for exit-0 states. Non-ok checkpoint
 * exits still use runner-local stdout emission for human/markdown modes, but
 * suppress that stream in JSON mode so the machine envelope remains valid until
 * clinkr owns non-ok stdout artifacts structurally.
 */
export function createObjectiveExecRunnerStepNsCommand(
	composition: ObjectiveRunnerComposition,
): NsCommand<typeof runnerStepRequestSchema, RunnerStepResult> {
	return createNsDomainCommand({
		name: "exec-runner-step",
		summary: RUNNER_STEP_DESCRIPTION,
		description: RUNNER_STEP_DESCRIPTION,
		schema: runnerStepRequestSchema,
		resultSchema: runnerStepResultSchema,
		positionals: { slug: { position: 0 } },
		createContext: (ctx) => createNsObjectiveRunnerContext(ctx, composition),
		handler: async (ctx, request) => {
			const guidance = await resolveGuidance({
				cwd: ctx.cwd,
				guidance: request.guidance,
				readTextFile: (path) => ctx.readTextFile(path),
			});
			if (guidance.type === "unreadable-file") {
				const problem = guidanceUsageProblem(guidance);
				return usageError(problem.message, { argument: problem.argument });
			}
			const stepRequest = { ...request, ...optionalEntry("guidance", guidance.guidance) };
			return runRunnerStep(ctx, stepRequest);
		},
		renderHuman: (result) => result.checkpointMarkdown,
		renderMarkdown: (result) => result.checkpointMarkdown,
	});
}

/** Live command: the factory composed with the real Pi child-session adapter. */
export const objectiveExecRunnerStepNsCommand = createObjectiveExecRunnerStepNsCommand({
	createChildSessionGateway: ({ env }) =>
		createPiChildSessionGateway({ env, clock: systemClock, timers: systemTimerScheduler }),
});

export default defineExtension({
	commands: [objectiveExecRunnerStepNsCommand],
});
