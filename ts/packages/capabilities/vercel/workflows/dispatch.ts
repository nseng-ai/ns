// The dispatch workflow (steel-thread sub-slice 1): one durable Vercel
// Workflow run supervising one dispatched unit of work end to end
// (seam-design §9). Steps are orchestration only — the agent loop runs
// inside the sandbox, never in a step. The launch step mints the clone
// token in-process and creates the sandbox over the exact dispatched SHA
// (the token never crosses a step boundary — only the sandbox name does);
// the body supervises through short poll steps separated by zero-compute
// `sleep()`s; the landing step late-mints the landing token into the single
// idempotent force-push; reporting publishes the decision log into the
// anchor PR description on success and posts the marked failure comment —
// anchor PR open, marked failed — on every failure path; cleanup runs on
// every path that has a sandbox, with the sandbox timeout as the backstop.
// Live workflow execution is pending verification: nothing here has run on
// Vercel yet.
import { sleep } from "workflow";

import {
	executeDispatchRun,
	type DispatchLandingResult,
	type DispatchLaunchResult,
	type DispatchOutcomeReadResult,
	type DispatchReportResult,
	type DispatchRunFailureCode,
	type DispatchRunInput,
	type WorkflowDispatchRunResult,
} from "../src/dispatch/dispatch-run.ts";
import {
	cleanupDispatchRun,
	landDispatchRun,
	launchDispatchRun,
	pollDispatchRun,
	readDispatchOutcome,
	reportDispatchFailure,
	reportDispatchLanded,
} from "../src/dispatch/dispatch-steps.ts";
import type {
	SupervisionCleanupResult,
	SupervisionPollResult,
} from "../src/sandbox/supervision-probe.ts";

// This workflow's manifest metadata id lives in `dispatch-id.ts`
// (runtime-free) so the trigger route's Node-builder bundle never imports
// this module — the `sleep` import above is unresolvable to the builder's
// TypeScript. The `build:deployable` gate verifies the id against the
// emitted manifest.

export async function dispatchWorkflow(
	input: DispatchRunInput,
): Promise<WorkflowDispatchRunResult> {
	"use workflow";
	// The orchestration itself is the deterministic `executeDispatchRun`
	// (validation, launch-once, probe-3's poll/sleep supervision loop,
	// harvest, land, cleanup, report) — the body only wires the durable
	// step functions and the Workflow SDK's zero-compute sleep into it.
	return await executeDispatchRun(input, {
		sleep: async (durationMs: number) => {
			await sleep(durationMs);
		},
		launch: async (run) => await launchDispatchStep(run),
		poll: async (sandboxName) => await pollDispatchStep(sandboxName),
		readOutcome: async (sandboxName) => await readDispatchOutcomeStep(sandboxName),
		land: async (options) => await landDispatchStep(options),
		cleanup: async (sandboxName) => await cleanupDispatchStep(sandboxName),
		reportLanded: async (options) => await reportDispatchLandedStep(options),
		reportFailure: async (options) => await reportDispatchFailureStep(options),
	});
}

export async function launchDispatchStep(run: DispatchRunInput): Promise<DispatchLaunchResult> {
	"use step";
	return await launchDispatchRun(run);
}
// At-least-once contract: steps retry silently by default, and a retry of
// this step would create a second sandbox and launch a second harness run.
// It must run at most once; a launch failure fails the dispatch instead.
launchDispatchStep.maxRetries = 0;

export async function pollDispatchStep(sandboxName: string): Promise<SupervisionPollResult> {
	"use step";
	return await pollDispatchRun({ sandboxName });
}

export async function readDispatchOutcomeStep(
	sandboxName: string,
): Promise<DispatchOutcomeReadResult> {
	"use step";
	return await readDispatchOutcome({ sandboxName });
}

export async function landDispatchStep(options: {
	readonly sandboxName: string;
	readonly anchorBranch: string;
}): Promise<DispatchLandingResult> {
	"use step";
	return await landDispatchRun(options);
}

export async function cleanupDispatchStep(sandboxName: string): Promise<SupervisionCleanupResult> {
	"use step";
	return await cleanupDispatchRun({ sandboxName });
}

export async function reportDispatchLandedStep(options: {
	readonly anchorPrNumber: number;
	readonly decisionLog: string | null;
}): Promise<DispatchReportResult> {
	"use step";
	return await reportDispatchLanded(options);
}

export async function reportDispatchFailureStep(options: {
	readonly anchorPrNumber: number;
	readonly anchorBranch: string;
	readonly code: DispatchRunFailureCode;
	readonly message: string;
}): Promise<DispatchReportResult> {
	"use step";
	return await reportDispatchFailure(options);
}
