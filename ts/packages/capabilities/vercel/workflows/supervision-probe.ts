// Probe-3 (long-run supervision): a detached command in a minimal sandbox
// that can exceed a single function invocation ceiling (>13 minutes live),
// supervised by short poll steps separated by zero-compute `sleep()`s —
// the Workflow SDK sandbox cookbook's supervisor shape, which probe-2
// deliberately did not exercise. The launch step creates the sandbox and
// starts the detached command, and only the sandbox name crosses the step
// boundary; each later step reattaches by that name. No credentials exist
// anywhere in this probe: the sandbox holds no repo checkout and the
// Sandbox SDK resolves the deployed Function's own workload identity
// ambiently. Cleanup runs on every path that has a sandbox, with the
// sandbox timeout as the backstop. Live workflow execution is pending
// verification: nothing here has run on Vercel yet. This probe-specific
// workflow retires only after the long-run live pass is proven and folded;
// the neutral supervision core remains reusable.
import { sleep } from "workflow";

import {
	combineSupervisionProbeResult,
	planSupervisionProbe,
	type SupervisionLaunchResult,
	type SupervisionProbeParams,
	type SupervisionProbePollResult,
	type WorkflowSupervisionProbeResult,
} from "../src/sandbox/supervision-probe.ts";
import { superviseDetachedRun, type SupervisionCleanupResult } from "../src/sandbox/supervision.ts";
import {
	cleanupSupervisionProbe,
	launchSupervisionProbe,
	pollSupervisionProbe,
} from "../src/sandbox/supervision-probe-steps.ts";

// This workflow's manifest metadata id lives in `supervision-probe-id.ts`
// (runtime-free) so the trigger route's Node-builder bundle never imports
// this module — the `sleep` import above is unresolvable to the builder's
// TypeScript. The `build:deployable` gate verifies the id against the
// emitted manifest.

export async function supervisionProbeWorkflow(
	params: SupervisionProbeParams,
): Promise<WorkflowSupervisionProbeResult> {
	"use workflow";
	const plan = planSupervisionProbe(params);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (plan.ok === false) {
		return { ok: false, code: plan.code, message: plan.message };
	}

	const launch = await launchSupervisionStep(params);
	if (launch.ok === false) {
		if (launch.sandboxName === undefined) {
			return { ok: false, code: launch.code, message: launch.message };
		}
		const cleanup = await cleanupSupervisionStep(launch.sandboxName);
		return cleanup.ok === false
			? {
					ok: false,
					code: cleanup.code,
					message: cleanup.message,
					sandboxName: launch.sandboxName,
				}
			: {
					ok: false,
					code: launch.code,
					message: launch.message,
					sandboxName: launch.sandboxName,
				};
	}
	const sandboxName = launch.sandboxName;

	// The supervision loop runs in the workflow body: each `sleep()` suspends
	// the run at zero compute while the detached command keeps executing in
	// the sandbox, and each poll is a short step well under the function
	// ceiling. The loop is deterministic given its deps, as replay requires.
	let ticks = 0;
	const outcome = await superviseDetachedRun(plan.value, {
		sleep: async (durationMs: number) => {
			await sleep(durationMs);
		},
		poll: async () => {
			const poll = await pollSupervisionStep(sandboxName);
			if (poll.ok) ticks = poll.ticks;
			return poll.ok ? { ok: true, phase: poll.phase } : poll;
		},
	});

	const cleanup = await cleanupSupervisionStep(sandboxName);
	return combineSupervisionProbeResult({ params, sandboxName, outcome, cleanup, ticks });
}

export async function launchSupervisionStep(
	params: SupervisionProbeParams,
): Promise<SupervisionLaunchResult> {
	"use step";
	return await launchSupervisionProbe(params);
}
// At-least-once contract: steps retry silently by default, and a retry of
// this step would create a second sandbox and launch a second detached run.
// It must run at most once; a launch failure fails the workflow instead.
launchSupervisionStep.maxRetries = 0;

export async function pollSupervisionStep(
	sandboxName: string,
): Promise<SupervisionProbePollResult> {
	"use step";
	return await pollSupervisionProbe({ sandboxName });
}

export async function cleanupSupervisionStep(
	sandboxName: string,
): Promise<SupervisionCleanupResult> {
	"use step";
	return await cleanupSupervisionProbe({ sandboxName });
}
