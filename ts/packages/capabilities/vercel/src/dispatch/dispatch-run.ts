// The dispatch workflow's pure core (steel-thread sub-slice 1): strict
// run-input validation, the fixed supervision plan, the in-sandbox
// prompt/result/decision-log path contract, harness-result parsing, the
// landing command, and the deterministic orchestration the workflow body
// executes. This module is imported by the workflow *body* in
// `workflows/dispatch.ts`, which replays inside the Workflow SDK's
// deterministic sandbox, so it must stay dependency-free (no Node builtins,
// no zod, no vendor SDKs) and every function here must be deterministic.
// The supervision loop is the probe-neutral `superviseDetachedRun`, reused
// by dispatch and probe-3. Step-side I/O lives in `dispatch-steps.ts`; the real
// adapters live in `real-dispatch-sandbox-gateway.ts` and
// `real-dispatch-report-gateway.ts`. Live workflow execution is pending
// verification: nothing here has run on Vercel yet.
import {
	superviseDetachedRun,
	type SupervisionCleanupResult,
	type SupervisionOutcome,
	type SupervisionPlan,
	type SupervisionPollResult,
} from "../sandbox/supervision.ts";
import type { SandboxCommand } from "../sandbox/contracts.ts";
import type { DispatchHarnessCompletion } from "./completion-contract.ts";
import type { DispatchPlanContextLocator } from "./dispatch-context.ts";
import type { DispatchHarness } from "./harness-registry.ts";
import { isCommitSha } from "../sandbox/validation.ts";

/**
 * Every dispatch anchor branch carries this prefix (seam-design §5): it is
 * both the user-visible naming convention and the jobs TUI's enumeration
 * filter.
 */
export const DISPATCH_ANCHOR_BRANCH_PREFIX = "dispatch/";

/** Validated bounds for the run input's anchor branch name. */
export const DISPATCH_ANCHOR_BRANCH_MAX_CHARS = 200;

/** Validated bound for the run input's anchor PR number. */
export const DISPATCH_ANCHOR_PR_NUMBER_MAX = 1_000_000_000;

/** Validated bounds for the run input's prompt / work reference. */
export const DISPATCH_PROMPT_MAX_CHARS = 20_000;

/**
 * Where the workflow writes the dispatched prompt inside the sandbox before
 * launching the harness. Part of the harness-invocation contract: the
 * configured launch command must read its unit of work from this path.
 */
export const DISPATCH_PROMPT_PATH = "/tmp/ns-dispatch/prompt.md";

/**
 * Where the harness must write its completion result. Absent while the run
 * is in flight; on completion it holds a single JSON object
 * `{ "outcome": "completed" | "failed", "summary"?: string }`. The poll
 * step treats the file's existence as "the detached run finished".
 */
export const DISPATCH_RESULT_PATH = "/tmp/ns-dispatch/result.json";

/**
 * Where the harness records its decision log — every judgment call it made
 * where it would normally have asked (README "The anchor PR"). Read after
 * completion and published into the anchor PR description.
 */
export const DISPATCH_DECISION_LOG_PATH = "/tmp/ns-dispatch/decision-log.md";

/**
 * v1 run budget: how long the detached harness run may take before the
 * workflow declares it timed out. Fixed, not caller input; together with
 * the sandbox timeout margin it stays well under the 5-hour sandbox cap
 * (snapshot rotation is parked).
 */
export const DISPATCH_RUN_BUDGET_SECONDS = 14_400;

/** Fixed supervision poll cadence. */
export const DISPATCH_POLL_SECONDS = 60;

/**
 * Extra supervision budget past the run budget before the workflow declares
 * the run timed out (the harness's final result write can land just after
 * the deadline).
 */
export const DISPATCH_GRACE_SECONDS = 120;

/**
 * How far past the run budget the sandbox itself stays alive. The sandbox
 * timeout is the cleanup backstop when supervision fails;
 * budget + margin = 4.5 hours, under the 5-hour sandbox cap.
 */
export const DISPATCH_SANDBOX_TIMEOUT_MARGIN_SECONDS = 1_800;

/** Cap applied to the harness result's optional summary when parsing. */
export const DISPATCH_SUMMARY_MAX_CHARS = 2_000;

/**
 * The run-input contract (roadmap steel-thread row): the CLI (sub-slice 3,
 * a later step) produces these; the trigger route zod-validates the same
 * bounds on the wire. Everything else a run needs — repository, harness
 * invocation, credentials — is deployable-side configuration, never caller
 * input.
 */
interface DispatchRunIdentity {
	/** Exact 40-hex commit SHA the sandbox checks out. */
	readonly revision: string;
	/** `dispatch/`-prefixed anchor branch the produced commits land on. */
	readonly anchorBranch: string;
	/** The anchor PR opened up front by the CLI on the user's credentials. */
	readonly anchorPrNumber: number;
}

/** Existing prompt dispatch input. Its wire shape remains unchanged. */
export interface DispatchPromptRunInput extends DispatchRunIdentity {
	/** The prompt / work reference the harness runs. */
	readonly prompt: string;
}

/**
 * Saved Plan dispatch input. The plan body is deliberately absent: the
 * workflow receives only the dispatch identity and git-native context locator.
 */
export interface DispatchPlanRunInput extends DispatchRunIdentity {
	readonly dispatchId: string;
	readonly contextLocator: DispatchPlanContextLocator;
}

export type DispatchRunInput = DispatchPromptRunInput | DispatchPlanRunInput;

export type DispatchRunInputValidation =
	| { readonly ok: true; readonly value: DispatchRunInput }
	| { readonly ok: false; readonly message: string };

/**
 * Strict run-input validation. The trigger route already zod-validates the
 * same bounds; this re-check keeps the workflow safe if it is ever started
 * another way, using plain checks so the workflow bundle stays
 * dependency-free. The anchor branch check is also injection safety: the
 * validated name is later embedded in the landing command.
 */
export function validateDispatchRunInput(input: DispatchRunInput): DispatchRunInputValidation {
	if (!isCommitSha(input.revision)) {
		return { ok: false, message: "revision must be a 40-character commit SHA." };
	}
	if (!isValidDispatchAnchorBranch(input.anchorBranch)) {
		return {
			ok: false,
			message:
				`anchorBranch must be a ${DISPATCH_ANCHOR_BRANCH_PREFIX}-prefixed git branch name ` +
				`of at most ${DISPATCH_ANCHOR_BRANCH_MAX_CHARS} characters.`,
		};
	}
	if (
		!Number.isInteger(input.anchorPrNumber) ||
		input.anchorPrNumber < 1 ||
		input.anchorPrNumber > DISPATCH_ANCHOR_PR_NUMBER_MAX
	) {
		return { ok: false, message: "anchorPrNumber must be a positive integer." };
	}
	if ("prompt" in input) {
		if (input.prompt.length < 1 || input.prompt.length > DISPATCH_PROMPT_MAX_CHARS) {
			return {
				ok: false,
				message: `prompt must be between 1 and ${DISPATCH_PROMPT_MAX_CHARS} characters.`,
			};
		}
		return {
			ok: true,
			value: {
				revision: input.revision.toLowerCase(),
				anchorBranch: input.anchorBranch,
				anchorPrNumber: input.anchorPrNumber,
				prompt: input.prompt,
			},
		};
	}
	const locatorError = validateDispatchPlanContextLocator(input.contextLocator, input.dispatchId);
	if (locatorError !== null) return { ok: false, message: locatorError };
	return {
		ok: true,
		value: {
			revision: input.revision.toLowerCase(),
			anchorBranch: input.anchorBranch,
			anchorPrNumber: input.anchorPrNumber,
			dispatchId: input.dispatchId,
			contextLocator: { ...input.contextLocator },
		},
	};
}

/**
 * Anchor branch names are `dispatch/`-prefixed, restricted to a safe
 * charset, and structurally valid git branch names (no empty, dot-leading,
 * or `.lock`-suffixed segments, no `..`). The restriction is deliberately
 * tighter than git's own rules: the validated name is interpolated into the
 * landing command's shell script, so the charset must exclude quoting and
 * expansion characters.
 */
function validateDispatchPlanContextLocator(
	locator: DispatchPlanContextLocator,
	dispatchId: string,
): string | null {
	if (dispatchId !== locator.dispatchId) {
		return "dispatchId must match contextLocator.dispatchId.";
	}
	if (locator.namespace !== "dispatch-context") {
		return "contextLocator.namespace must be dispatch-context.";
	}
	if (locator.contextPrefix !== `${dispatchId}/`) {
		return "contextLocator.contextPrefix must be the Dispatch ID prefix.";
	}
	if (
		!locator.planKey.startsWith(`${locator.contextPrefix}plan/`) ||
		!locator.planKey.endsWith(".md") ||
		!/^[A-Za-z0-9._/-]+$/.test(locator.planKey)
	) {
		return "contextLocator.planKey must be the convention-required Saved Plan member.";
	}
	if (!/^[A-Za-z0-9._/-]+$/.test(locator.sourceBranch)) {
		return "contextLocator.sourceBranch is invalid.";
	}
	if (
		locator.snapshotRef.includes(":") ||
		locator.snapshotRef.includes("..") ||
		!/^[A-Za-z0-9._/-]+$/.test(locator.snapshotRef) ||
		!locator.snapshotRef.startsWith("refs/brmem/ns/dispatch-context/")
	) {
		return "contextLocator.snapshotRef is not a dispatch-context Snapshot Ref.";
	}
	if (!isCommitSha(locator.snapshotCommitSha)) {
		return "contextLocator.snapshotCommitSha must be a 40-character commit SHA.";
	}
	if (locator.entryLocator !== `${locator.snapshotRef}:${locator.planKey}`) {
		return "contextLocator.entryLocator must identify the required plan member.";
	}
	return null;
}

export function isValidDispatchAnchorBranch(name: string): boolean {
	if (!name.startsWith(DISPATCH_ANCHOR_BRANCH_PREFIX)) return false;
	if (name.length > DISPATCH_ANCHOR_BRANCH_MAX_CHARS) return false;
	if (!/^[A-Za-z0-9._/-]+$/.test(name)) return false;
	if (name.includes("..")) return false;
	if (name.endsWith("/") || name.endsWith(".")) return false;
	const segments = name.split("/");
	for (const segment of segments) {
		if (segment.length === 0) return false;
		if (segment.startsWith(".")) return false;
		if (segment.endsWith(".lock")) return false;
	}
	return true;
}

/**
 * Derive the fixed supervision plan (probe-3's plan shape over dispatch's
 * fixed budget and cadence). Constant by construction, so unlike probe-3
 * there is nothing to fail: dispatch run length is not caller input.
 */
export function planDispatchSupervision(): SupervisionPlan {
	return {
		pollIntervalMs: DISPATCH_POLL_SECONDS * 1000,
		maxPolls:
			Math.ceil((DISPATCH_RUN_BUDGET_SECONDS + DISPATCH_GRACE_SECONDS) / DISPATCH_POLL_SECONDS) + 1,
		sandboxTimeoutMs:
			(DISPATCH_RUN_BUDGET_SECONDS + DISPATCH_SANDBOX_TIMEOUT_MARGIN_SECONDS) * 1000,
	};
}

export type DispatchHarnessResult =
	| { readonly phase: "running" }
	| ({ readonly phase: "finished" } & DispatchHarnessCompletion)
	| { readonly phase: "invalid" };

/**
 * Parse the harness's result file. A missing file (`null`) means the
 * detached run is still in flight. A present file must hold the contract's
 * JSON object; anything else is `invalid` — the run finished but its
 * outcome cannot be trusted, which the disposition maps to a failure.
 * Extra keys are tolerated so the harness contract can grow; the summary is
 * length-capped because it flows into anchor PR content.
 */
export function parseDispatchHarnessResult(content: string | null): DispatchHarnessResult {
	if (content === null) return { phase: "running" };
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return { phase: "invalid" };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return { phase: "invalid" };
	}
	const record = parsed as Record<string, unknown>;
	const outcome = record["outcome"];
	if (outcome !== "completed" && outcome !== "failed") return { phase: "invalid" };
	const summary = record["summary"];
	// Positive `typeof` narrowing only: the Vercel builder typechecks without
	// strictNullChecks, where negated cross-statement narrowing does not hold.
	if (summary === undefined) return { phase: "finished", outcome };
	if (typeof summary === "string") {
		return { phase: "finished", outcome, summary: summary.slice(0, DISPATCH_SUMMARY_MAX_CHARS) };
	}
	return { phase: "invalid" };
}

/**
 * The single landing command (credentials design): the landing token is
 * late-minted in the landing step and injected into this one command's
 * environment — never into the sandbox environment, the journal, or logs.
 * `HEAD` force-pushed to the anchor branch is idempotent: re-running the
 * at-least-once landing step pushes the same commits to the same ref. Both
 * interpolated values must already be validated (`parseGitHubRepository`
 * charset for the repository, {@link isValidDispatchAnchorBranch} for the
 * branch), which excludes quoting and expansion characters.
 */
export const DISPATCH_LANDING_TOKEN_ENV_NAME = "NS_DISPATCH_LANDING_TOKEN";

export function buildDispatchPlanSnapshotFetchCommand(
	locator: DispatchPlanContextLocator,
): SandboxCommand {
	return {
		cmd: "sh",
		args: [
			"-c",
			'git fetch --no-tags origin "+$1:$1" && test "$(git rev-parse "$1^{commit}")" = "$2"',
			"ns-dispatch-fetch-context",
			locator.snapshotRef,
			locator.snapshotCommitSha,
		],
	};
}

export function buildDispatchPlanEntryCheckCommand(
	locator: DispatchPlanContextLocator,
): SandboxCommand {
	return {
		cmd: "pnpm",
		args: [
			"--dir",
			"ts",
			"exec",
			"brmem",
			"check",
			locator.planKey,
			"--namespace",
			locator.namespace,
			"--branch",
			locator.sourceBranch,
			"--at",
			locator.snapshotCommitSha,
			"--require",
		],
	};
}

export function buildDispatchPlanHarnessInstruction(locator: DispatchPlanContextLocator): string {
	return (
		"Your first agent action must be to run this command exactly:\n\n" +
		`pnpm --dir ts exec brmem get ${locator.planKey} --namespace ${locator.namespace} ` +
		`--branch ${locator.sourceBranch} --at ${locator.snapshotCommitSha}\n\n` +
		"Treat the command output as the Saved Plan and execute that plan."
	);
}

export function buildDispatchLandingCommand(options: {
	readonly repository: string;
	readonly anchorBranch: string;
}): SandboxCommand {
	const script =
		`git push --force "https://x-access-token:$${DISPATCH_LANDING_TOKEN_ENV_NAME}@github.com/` +
		`${options.repository}.git" "HEAD:refs/heads/${options.anchorBranch}"`;
	return { cmd: "sh", args: ["-c", script] };
}

/**
 * Gateway seam over the Vercel Sandbox surface the dispatch workflow needs:
 * create the sandbox over the exact dispatched SHA (clone token injected at
 * creation, in-memory only), then reattach by sandbox name from later steps
 * to write files, run provision/landing commands, launch the detached
 * harness, read result files, and stop. Only the sandbox name crosses step
 * boundaries; the live handle and every credential stay inside the step
 * that holds them. Vercel vocabulary is deliberate; vendor types stay
 * inside the real adapter. Command results never carry argv, env, or
 * output — nothing here may journal a secret.
 */
export interface DispatchSandboxGateway {
	createDispatchSandbox(options: {
		readonly runtime: "node24";
		readonly timeoutMs: number;
		readonly source: {
			readonly repository: string;
			readonly revision: string;
			readonly cloneToken: string;
		};
	}): Promise<CreateDispatchSandboxResult>;
	writeSandboxFile(options: {
		readonly sandboxName: string;
		readonly path: string;
		readonly content: string;
	}): Promise<WriteDispatchSandboxFileResult>;
	runSandboxCommand(options: {
		readonly sandboxName: string;
		readonly command: SandboxCommand;
		readonly env?: Readonly<Record<string, string>>;
	}): Promise<RunDispatchSandboxCommandResult>;
	runDetachedSandboxCommand(options: {
		readonly sandboxName: string;
		readonly command: SandboxCommand;
		readonly env?: Readonly<Record<string, string>>;
	}): Promise<RunDetachedDispatchSandboxCommandResult>;
	readSandboxFile(options: {
		readonly sandboxName: string;
		readonly path: string;
	}): Promise<ReadDispatchSandboxFileResult>;
	stopSandbox(options: { readonly sandboxName: string }): Promise<StopDispatchSandboxResult>;
}

export type CreateDispatchSandboxResult =
	| { readonly ok: true; readonly sandboxName: string }
	| { readonly ok: false };

export type WriteDispatchSandboxFileResult = { readonly ok: true } | { readonly ok: false };

export type RunDispatchSandboxCommandResult =
	| { readonly ok: true; readonly exitCode: number }
	| { readonly ok: false };

export type RunDetachedDispatchSandboxCommandResult =
	| { readonly ok: true }
	| { readonly ok: false };

export type ReadDispatchSandboxFileResult =
	| { readonly ok: true; readonly content: string | null }
	| { readonly ok: false };

export type StopDispatchSandboxResult = { readonly ok: true } | { readonly ok: false };

export type DispatchRunFailureCode =
	| "invalid-input"
	| "dispatch-misconfigured"
	| "launch-failed"
	| "poll-failed"
	| "run-timed-out"
	| "outcome-read-failed"
	| "harness-result-invalid"
	| "harness-failed"
	| "landing-failed"
	| "sandbox-cleanup-failed";

export type DispatchLaunchResult =
	| { readonly ok: true; readonly sandboxName: string; readonly harness: DispatchHarness }
	| {
			readonly ok: false;
			readonly code: "invalid-input" | "dispatch-misconfigured" | "launch-failed";
			readonly message: string;
			/** Present only when a safely reattachable sandbox was created. */
			readonly sandboxName?: string;
	  };

export type DispatchOutcomeReadResult =
	| {
			readonly ok: true;
			readonly outcome: "completed" | "failed" | "invalid";
			readonly summary?: string;
			readonly decisionLog: string | null;
	  }
	| { readonly ok: false };

export type DispatchLandingResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly code: "dispatch-misconfigured" | "landing-failed";
			readonly message: string;
	  };

export type DispatchReportResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly message?: string };

/**
 * The workflow's serializable result — durable, observable run state. It
 * carries only non-secret facts: the sandbox name, the anchor identity the
 * caller already knows, poll counts, and whether reporting reached the
 * anchor PR.
 */
export type WorkflowDispatchRunResult =
	| {
			readonly ok: true;
			readonly sandboxName: string;
			readonly anchorBranch: string;
			readonly anchorPrNumber: number;
			readonly polls: number;
			readonly decisionLogPublished: boolean;
	  }
	| {
			readonly ok: false;
			readonly code: DispatchRunFailureCode;
			readonly message: string;
			readonly anchorBranch?: string;
			readonly anchorPrNumber?: number;
			readonly sandboxName?: string;
			readonly polls?: number;
			readonly failureReported: boolean;
	  };

export type DispatchDisposition =
	| { readonly kind: "landed"; readonly decisionLog: string | null }
	| { readonly kind: "failed"; readonly code: DispatchRunFailureCode; readonly message: string };

/**
 * Combine the supervision outcome, the harvested harness outcome, the
 * landing result, and the cleanup result into one disposition. A cleanup
 * failure wins over everything else (a possibly-leaked sandbox is the worst
 * outcome; its timeout is the backstop — probe-3's precedent), then the
 * supervision failure, then the harness outcome, then landing, then
 * success.
 */
export function resolveDispatchDisposition(options: {
	readonly outcome: SupervisionOutcome;
	readonly harvest: DispatchOutcomeReadResult | null;
	readonly landing: DispatchLandingResult | null;
	readonly cleanup: SupervisionCleanupResult;
}): DispatchDisposition {
	const { outcome, harvest, landing, cleanup } = options;
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (cleanup.ok === false) {
		return {
			kind: "failed",
			code: "sandbox-cleanup-failed",
			message:
				landing !== null && landing.ok
					? "Sandbox cleanup failed after the produced commits landed on the anchor branch."
					: "Sandbox cleanup failed.",
		};
	}
	if (outcome.completed === false) {
		return {
			kind: "failed",
			code: outcome.code,
			message:
				outcome.code === "run-timed-out"
					? "The dispatched run did not finish within the run budget."
					: "Supervision poll failed.",
		};
	}
	if (harvest === null || harvest.ok === false) {
		return {
			kind: "failed",
			code: "outcome-read-failed",
			message: "Reading the dispatched run's outcome failed.",
		};
	}
	if (harvest.outcome === "invalid") {
		return {
			kind: "failed",
			code: "harness-result-invalid",
			message: "The dispatched harness run finished without a valid result.",
		};
	}
	if (harvest.outcome === "failed") {
		return {
			kind: "failed",
			code: "harness-failed",
			message:
				harvest.summary === undefined
					? "The dispatched harness run reported failure."
					: `The dispatched harness run reported failure: ${harvest.summary}`,
		};
	}
	if (landing === null) {
		return { kind: "failed", code: "landing-failed", message: "Landing was not attempted." };
	}
	if (landing.ok === false) {
		return { kind: "failed", code: landing.code, message: landing.message };
	}
	return { kind: "landed", decisionLog: harvest.decisionLog };
}

/**
 * The step functions the dispatch workflow body wires in
 * (`workflows/dispatch.ts`); tests drive this orchestration with in-memory
 * fakes. `sleep` is the Workflow SDK's zero-compute suspension in
 * production and a manual fake in tests.
 */
export interface DispatchRunSteps {
	sleep(durationMs: number): Promise<void>;
	launch(input: DispatchRunInput): Promise<DispatchLaunchResult>;
	poll(sandboxName: string, pollOrdinal: number): Promise<SupervisionPollResult>;
	readOutcome(sandboxName: string): Promise<DispatchOutcomeReadResult>;
	land(options: {
		readonly sandboxName: string;
		readonly anchorBranch: string;
	}): Promise<DispatchLandingResult>;
	cleanup(sandboxName: string): Promise<SupervisionCleanupResult>;
	reportLanded(options: {
		readonly anchorPrNumber: number;
		readonly decisionLog: string | null;
	}): Promise<DispatchReportResult>;
	reportFailure(options: {
		readonly anchorPrNumber: number;
		readonly anchorBranch: string;
		readonly code: DispatchRunFailureCode;
		readonly message: string;
	}): Promise<DispatchReportResult>;
}

/**
 * The dispatch run's deterministic orchestration, executed directly by the
 * workflow body under replay: validate strictly, launch once (the workflow
 * marks that step `maxRetries = 0`), supervise with probe-3's poll/sleep
 * loop, harvest the outcome, land completed work, clean up on every path
 * that has a sandbox, and always report the terminal state on the anchor
 * PR — success publishes the decision log into the PR description, every
 * failure posts the failure comment that leaves the anchor PR open and
 * marked failed. Invalid input is the one unreported failure: its anchor
 * identity is untrusted by definition.
 */
export async function executeDispatchRun(
	input: DispatchRunInput,
	steps: DispatchRunSteps,
): Promise<WorkflowDispatchRunResult> {
	const validated = validateDispatchRunInput(input);
	// `=== false` rather than `!`: the Vercel builder typechecks without
	// strictNullChecks, where truthiness checks do not narrow the union.
	if (validated.ok === false) {
		return {
			ok: false,
			code: "invalid-input",
			message: validated.message,
			failureReported: false,
		};
	}
	const run = validated.value;
	const anchor = { anchorBranch: run.anchorBranch, anchorPrNumber: run.anchorPrNumber };

	const launch = await steps.launch(run);
	if (launch.ok === false) {
		let code: DispatchRunFailureCode = launch.code;
		let message = launch.message;
		if (launch.sandboxName !== undefined) {
			const cleanup = await steps.cleanup(launch.sandboxName);
			if (cleanup.ok === false) {
				code = cleanup.code;
				message = cleanup.message;
			}
		}
		const reported = await steps.reportFailure({ ...anchor, code, message });
		return {
			ok: false,
			code,
			message,
			...anchor,
			...(launch.sandboxName === undefined ? {} : { sandboxName: launch.sandboxName }),
			failureReported: reported.ok,
		};
	}
	const sandboxName = launch.sandboxName;

	// The supervision loop runs in the workflow body: each `sleep()` suspends
	// the run at zero compute while the harness keeps executing in the
	// sandbox, and each poll is a short step well under the function ceiling.
	const outcome = await superviseDetachedRun(planDispatchSupervision(), {
		sleep: async (durationMs: number) => {
			await steps.sleep(durationMs);
		},
		poll: async (pollOrdinal) => await steps.poll(sandboxName, pollOrdinal),
	});

	let harvest: DispatchOutcomeReadResult | null = null;
	if (outcome.completed) {
		harvest = await steps.readOutcome(sandboxName);
	}

	let landing: DispatchLandingResult | null = null;
	if (harvest !== null && harvest.ok && harvest.outcome === "completed") {
		landing = await steps.land({ sandboxName, anchorBranch: run.anchorBranch });
	}

	const cleanup = await steps.cleanup(sandboxName);

	const disposition = resolveDispatchDisposition({ outcome, harvest, landing, cleanup });
	if (disposition.kind === "landed") {
		const reported = await steps.reportLanded({
			anchorPrNumber: run.anchorPrNumber,
			decisionLog: disposition.decisionLog,
		});
		return {
			ok: true,
			sandboxName,
			...anchor,
			polls: outcome.polls,
			decisionLogPublished: reported.ok,
		};
	}
	const reported = await steps.reportFailure({
		...anchor,
		code: disposition.code,
		message: disposition.message,
	});
	return {
		ok: false,
		code: disposition.code,
		message: disposition.message,
		sandboxName,
		...anchor,
		polls: outcome.polls,
		failureReported: reported.ok,
	};
}
