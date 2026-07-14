// Probe-3 (long-run supervision) pure core: the deterministic pieces of the
// supervision probe — parameter validation and planning, the fixed detached
// command, progress parsing, the poll/sleep supervision loop, and result
// combination. This module is imported by the workflow *body* in
// `workflows/supervision-probe.ts`, which replays inside the Workflow SDK's
// deterministic sandbox, so it must stay dependency-free (no Node builtins,
// no zod, no vendor SDKs) and every function here must be deterministic.
// Step-side I/O lives in `supervision-probe-steps.ts`; reusable poll/sleep
// supervision lives in `supervision.ts`; the real Sandbox adapter lives in
// `real-supervision-sandbox-gateway.ts`. Probe-specific modules remain until
// the long-run live pass is proven and folded; neutral `supervision.ts`
// survives that retirement.
import type { SandboxCommand } from "./contracts.ts";
import type {
	SupervisionCleanupResult,
	SupervisionOutcome,
	SupervisionPlan,
} from "./supervision.ts";

/**
 * Validated bounds for the trigger's `runSeconds` parameter. The run length
 * is caller-tunable so one deployment serves both quick smoke runs and the
 * live >13-minute supervision proof (a single function invocation ceiling is
 * ~13 minutes; 840 seconds exceeds it and sits comfortably inside the
 * maximum).
 */
export const SUPERVISION_RUN_SECONDS_MIN = 10;
export const SUPERVISION_RUN_SECONDS_MAX = 3600;

/** Validated bounds for the trigger's `pollSeconds` poll cadence. */
export const SUPERVISION_POLL_SECONDS_MIN = 5;
export const SUPERVISION_POLL_SECONDS_MAX = 300;

/** How often the detached command appends a progress tick. */
export const SUPERVISION_TICK_SECONDS = 5;

/**
 * Extra supervision budget past the requested run length before the workflow
 * declares the run timed out (the detached command's final tick plus append
 * can land just after the deadline).
 */
export const SUPERVISION_GRACE_SECONDS = 60;

/**
 * How far past the requested run length the sandbox itself stays alive. The
 * sandbox timeout is the cleanup backstop when supervision fails; the
 * maximum (SUPERVISION_RUN_SECONDS_MAX + margin = 70 minutes) stays well
 * under the 5-hour sandbox cap.
 */
export const SUPERVISION_SANDBOX_TIMEOUT_MARGIN_SECONDS = 600;

/** Where the detached command appends progress inside the sandbox. */
export const SUPERVISION_PROGRESS_PATH = "/tmp/ns-supervision-probe-progress.log";

/** Final line the detached command appends when its run completes. */
export const SUPERVISION_DONE_MARKER = "__NS_SUPERVISION_PROBE_DONE_V1__";

export interface SupervisionProbeParams {
	readonly runSeconds: number;
	readonly pollSeconds: number;
}

export type SupervisionPlanResult =
	| { readonly ok: true; readonly value: SupervisionPlan }
	| { readonly ok: false; readonly code: "invalid-parameters"; readonly message: string };

/**
 * Validate the probe parameters and derive the supervision plan. The trigger
 * route already zod-validates the same bounds; this re-check keeps the
 * workflow safe if it is ever started another way, using plain number checks
 * so the workflow bundle stays dependency-free.
 */
export function planSupervisionProbe(params: SupervisionProbeParams): SupervisionPlanResult {
	if (
		!isBoundedInteger(params.runSeconds, SUPERVISION_RUN_SECONDS_MIN, SUPERVISION_RUN_SECONDS_MAX)
	) {
		return {
			ok: false,
			code: "invalid-parameters",
			message:
				`runSeconds must be an integer between ${SUPERVISION_RUN_SECONDS_MIN} ` +
				`and ${SUPERVISION_RUN_SECONDS_MAX}.`,
		};
	}
	if (
		!isBoundedInteger(
			params.pollSeconds,
			SUPERVISION_POLL_SECONDS_MIN,
			SUPERVISION_POLL_SECONDS_MAX,
		)
	) {
		return {
			ok: false,
			code: "invalid-parameters",
			message:
				`pollSeconds must be an integer between ${SUPERVISION_POLL_SECONDS_MIN} ` +
				`and ${SUPERVISION_POLL_SECONDS_MAX}.`,
		};
	}
	return {
		ok: true,
		value: {
			pollIntervalMs: params.pollSeconds * 1000,
			maxPolls: Math.ceil((params.runSeconds + SUPERVISION_GRACE_SECONDS) / params.pollSeconds),
			sandboxTimeoutMs: (params.runSeconds + SUPERVISION_SANDBOX_TIMEOUT_MARGIN_SECONDS) * 1000,
		},
	};
}

function isBoundedInteger(value: number, min: number, max: number): boolean {
	return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * The fixed detached command: append a numbered progress tick every
 * {@link SUPERVISION_TICK_SECONDS} seconds until the requested run length
 * elapses, then append {@link SUPERVISION_DONE_MARKER}. It proves
 * supervision, not work — trivial, observable through the progress file a
 * poll step reads. `runSeconds` must already be validated (an integer within
 * bounds), so interpolating it into the script is injection-safe.
 */
export function buildSupervisionProbeCommand(runSeconds: number): SandboxCommand {
	const script = [
		`deadline=$(( $(date +%s) + ${runSeconds} ))`,
		`: > '${SUPERVISION_PROGRESS_PATH}'`,
		"i=0",
		`while [ "$(date +%s)" -lt "$deadline" ]; do ` +
			`i=$((i+1)); printf 'tick %s\\n' "$i" >> '${SUPERVISION_PROGRESS_PATH}'; ` +
			`sleep ${SUPERVISION_TICK_SECONDS}; done`,
		`printf '%s\\n' '${SUPERVISION_DONE_MARKER}' >> '${SUPERVISION_PROGRESS_PATH}'`,
	].join("\n");
	return { cmd: "sh", args: ["-c", script] };
}

export interface SupervisionProgress {
	readonly phase: "running" | "done";
	readonly ticks: number;
}

/**
 * Parse the progress file's content. Tolerant by design: a missing file
 * (`null`, the detached command has not created it yet) and unrecognized
 * lines both read as "still running" — the poll loop's deadline is the
 * failure detector, not the file format.
 */
export function parseSupervisionProgress(content: string | null): SupervisionProgress {
	if (content === null) return { phase: "running", ticks: 0 };
	const lines = content.split(/\r?\n/);
	let ticks = 0;
	let hasDoneMarker = false;
	for (const line of lines) {
		if (/^tick \d+$/.test(line)) ticks += 1;
		if (line === SUPERVISION_DONE_MARKER) hasDoneMarker = true;
	}
	return { phase: hasDoneMarker ? "done" : "running", ticks };
}

export type SupervisionProbePollResult =
	| { readonly ok: true; readonly phase: "running" | "done"; readonly ticks: number }
	| { readonly ok: false; readonly code: "poll-failed"; readonly message: string };

export type SupervisionLaunchResult =
	| { readonly ok: true; readonly sandboxName: string }
	| {
			readonly ok: false;
			readonly code: "invalid-parameters" | "launch-failed";
			readonly message: string;
			readonly sandboxName?: string;
	  };

export type SupervisionProbeFailureCode =
	| "invalid-parameters"
	| "launch-failed"
	| "poll-failed"
	| "run-timed-out"
	| "sandbox-cleanup-failed";

/**
 * The workflow's serializable result — durable, observable run state. It
 * carries only non-secret facts: the sandbox name, the requested
 * parameters, and poll/tick counts.
 */
export type WorkflowSupervisionProbeResult =
	| {
			readonly ok: true;
			readonly sandboxName: string;
			readonly runSeconds: number;
			readonly pollSeconds: number;
			readonly polls: number;
			readonly ticks: number;
	  }
	| {
			readonly ok: false;
			readonly code: SupervisionProbeFailureCode;
			readonly message: string;
			readonly sandboxName?: string;
			readonly polls?: number;
			readonly ticks?: number;
	  };

/**
 * Combine the supervision outcome with the cleanup result. A cleanup failure
 * wins over everything else (a possibly-leaked sandbox is the worst
 * outcome; its timeout is the backstop), then the supervision failure, then
 * success — mirroring the hello probe's cleanup semantics.
 */
export function combineSupervisionProbeResult(options: {
	readonly params: SupervisionProbeParams;
	readonly sandboxName: string;
	readonly outcome: SupervisionOutcome;
	readonly cleanup: SupervisionCleanupResult;
	readonly ticks: number;
}): WorkflowSupervisionProbeResult {
	const { params, sandboxName, outcome, cleanup, ticks } = options;
	if (cleanup.ok === false) {
		return {
			ok: false,
			code: cleanup.code,
			message: cleanup.message,
			sandboxName,
			polls: outcome.polls,
			ticks,
		};
	}
	if (outcome.completed === false) {
		return {
			ok: false,
			code: outcome.code,
			message:
				outcome.code === "run-timed-out"
					? "Detached run did not report done within the supervision budget."
					: "Supervision poll failed.",
			sandboxName,
			polls: outcome.polls,
			ticks,
		};
	}
	return {
		ok: true,
		sandboxName,
		runSeconds: params.runSeconds,
		pollSeconds: params.pollSeconds,
		polls: outcome.polls,
		ticks,
	};
}

/**
 * Gateway seam over the Vercel Sandbox surface probe-3 needs: create a
 * minimal sandbox (no repo checkout, no credentials — the deployed
 * Function's own workload identity) with a detached command already
 * launched, then reattach by sandbox name from later steps to read progress
 * and stop. Only the sandbox name crosses step boundaries; the live handle
 * never leaves the step that holds it. Vercel vocabulary is deliberate;
 * vendor types stay inside the real adapter.
 */
export interface SupervisionSandboxGateway {
	createSandbox(options: {
		readonly runtime: "node24";
		readonly timeoutMs: number;
	}): Promise<CreateSupervisionSandboxResult>;
	runDetachedSandboxCommand(options: {
		readonly sandboxName: string;
		readonly command: SandboxCommand;
	}): Promise<RunDetachedSupervisionSandboxCommandResult>;
	readSandboxFile(options: {
		readonly sandboxName: string;
		readonly path: string;
	}): Promise<ReadSupervisionSandboxFileResult>;
	stopSandbox(options: { readonly sandboxName: string }): Promise<StopSupervisionSandboxResult>;
}

export type CreateSupervisionSandboxResult =
	| { readonly ok: true; readonly sandboxName: string }
	| { readonly ok: false };

export type RunDetachedSupervisionSandboxCommandResult =
	| { readonly ok: true }
	| { readonly ok: false };

export type ReadSupervisionSandboxFileResult =
	| { readonly ok: true; readonly content: string | null }
	| { readonly ok: false };

export type StopSupervisionSandboxResult = { readonly ok: true } | { readonly ok: false };
