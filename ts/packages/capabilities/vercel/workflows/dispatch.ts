// One durable Vercel Workflow run supervises one dispatched unit of work.
// The workflow body is deterministic orchestration; every side effect and
// operator-visible log lives in a step, while credentials and payload content
// never cross the existing step boundaries.
import { FatalError, sleep } from "workflow";

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
import {
	buildDispatchFailureAttributes,
	buildDispatchPhaseAttributes,
	buildDispatchRunningAttributes,
} from "../src/dispatch/workflow-observability.ts";
import { writeDispatchWorkflowAttributes } from "./dispatch-attribute-writer.ts";
import { writeDispatchWorkflowEvent } from "./dispatch-event-writer.ts";
import type {
	SupervisionCleanupResult,
	SupervisionPollResult,
} from "../src/sandbox/supervision.ts";

export async function dispatchWorkflow(
	input: DispatchRunInput,
): Promise<WorkflowDispatchRunResult> {
	"use workflow";
	const result = await executeDispatchRun(input, {
		sleep: async (durationMs: number) => {
			await sleep(durationMs);
		},
		launch: async (run) => await createSandboxAndLaunchHarness(run),
		poll: async (sandboxName, pollOrdinal) =>
			await checkHarnessCompletion(sandboxName, pollOrdinal),
		readOutcome: async (sandboxName) => await readHarnessResult(sandboxName),
		land: async (options) => await pushAnchorBranch(options),
		cleanup: async (sandboxName) => await stopSandbox(sandboxName),
		reportLanded: async (options) => await updateAnchorPrLanded(options),
		reportFailure: async (options) => await updateAnchorPrFailed(options),
	});
	if (result.ok) return result;
	return await failDispatchRun(result.code);
}

export async function createSandboxAndLaunchHarness(
	run: DispatchRunInput,
): Promise<DispatchLaunchResult> {
	"use step";
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_started",
		step: "launch",
		anchorPrNumber: run.anchorPrNumber,
	});
	await writeDispatchWorkflowAttributes(buildDispatchPhaseAttributes("launching"));
	const result = await launchDispatchRun(run);
	if (result.ok) {
		await writeDispatchWorkflowAttributes(buildDispatchRunningAttributes(result.harness));
		await writeDispatchWorkflowEvent({
			event: "dispatch_step_finished",
			step: "launch",
			outcome: "succeeded",
			anchorPrNumber: run.anchorPrNumber,
			sandboxName: result.sandboxName,
			harness: result.harness,
		});
		return result;
	}
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_finished",
		step: "launch",
		outcome: "failed",
		anchorPrNumber: run.anchorPrNumber,
		...(result.sandboxName === undefined ? {} : { sandboxName: result.sandboxName }),
		failureCode: result.code,
	});
	return result;
}
createSandboxAndLaunchHarness.maxRetries = 0;

export async function checkHarnessCompletion(
	sandboxName: string,
	pollOrdinal: number,
): Promise<SupervisionPollResult> {
	"use step";
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_started",
		step: "poll",
		sandboxName,
		pollOrdinal,
	});
	const result = await pollDispatchRun({ sandboxName });
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_finished",
		step: "poll",
		outcome: result.ok ? result.phase : "failed",
		sandboxName,
		pollOrdinal,
		...(result.ok ? {} : { failureCode: result.code }),
	});
	return result;
}

export async function readHarnessResult(sandboxName: string): Promise<DispatchOutcomeReadResult> {
	"use step";
	await writeDispatchWorkflowAttributes(buildDispatchPhaseAttributes("reading-result"));
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_started",
		step: "read-result",
		sandboxName,
	});
	const result = await readDispatchOutcome({ sandboxName });
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_finished",
		step: "read-result",
		outcome: result.ok ? "succeeded" : "failed",
		sandboxName,
	});
	return result;
}

export async function pushAnchorBranch(options: {
	readonly sandboxName: string;
	readonly anchorBranch: string;
}): Promise<DispatchLandingResult> {
	"use step";
	await writeDispatchWorkflowAttributes(buildDispatchPhaseAttributes("landing"));
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_started",
		step: "land",
		sandboxName: options.sandboxName,
	});
	const result = await landDispatchRun(options);
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_finished",
		step: "land",
		outcome: result.ok ? "succeeded" : "failed",
		sandboxName: options.sandboxName,
		...(result.ok ? {} : { failureCode: result.code }),
	});
	return result;
}

export async function stopSandbox(sandboxName: string): Promise<SupervisionCleanupResult> {
	"use step";
	await writeDispatchWorkflowAttributes(buildDispatchPhaseAttributes("cleaning"));
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_started",
		step: "cleanup",
		sandboxName,
	});
	const result = await cleanupDispatchRun({ sandboxName });
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_finished",
		step: "cleanup",
		outcome: result.ok ? "succeeded" : "failed",
		sandboxName,
		...(result.ok ? {} : { failureCode: result.code }),
	});
	return result;
}

export async function updateAnchorPrLanded(options: {
	readonly anchorPrNumber: number;
	readonly decisionLog: string | null;
}): Promise<DispatchReportResult> {
	"use step";
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_started",
		step: "update-anchor-pr",
		anchorPrNumber: options.anchorPrNumber,
	});
	const result = await reportDispatchLanded(options);
	await writeDispatchWorkflowAttributes(buildDispatchPhaseAttributes("completed"));
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_finished",
		step: "update-anchor-pr",
		outcome: result.ok ? "succeeded" : "failed",
		anchorPrNumber: options.anchorPrNumber,
	});
	return result;
}

export async function updateAnchorPrFailed(options: {
	readonly anchorPrNumber: number;
	readonly anchorBranch: string;
	readonly code: DispatchRunFailureCode;
	readonly message: string;
}): Promise<DispatchReportResult> {
	"use step";
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_started",
		step: "update-anchor-pr",
		anchorPrNumber: options.anchorPrNumber,
	});
	const result = await reportDispatchFailure(options);
	await writeDispatchWorkflowAttributes(buildDispatchFailureAttributes(options.code));
	await writeDispatchWorkflowEvent({
		event: "dispatch_step_finished",
		step: "update-anchor-pr",
		outcome: result.ok ? "succeeded" : "failed",
		anchorPrNumber: options.anchorPrNumber,
		failureCode: options.code,
	});
	return result;
}

export async function failDispatchRun(code: DispatchRunFailureCode): Promise<never> {
	"use step";
	await writeDispatchWorkflowEvent({ event: "dispatch_step_started", step: "terminal-failure" });
	await writeDispatchWorkflowAttributes(buildDispatchFailureAttributes(code));
	throw new FatalError(`dispatch failed: ${code}`);
}
failDispatchRun.maxRetries = 0;
