// The ns-owned pi runner's core (steel-thread sub-slice 2): the process the
// dispatch workflow launches detached inside the sandbox. It is the harness
// side of the step-6 invocation contract (`src/dispatch/harness-invocation.ts`
// and the `DISPATCH_*_PATH` constants in `src/dispatch/dispatch-run.ts`):
// read the dispatched prompt, run the pi agent loop to completion over the
// checkout, make sure produced work is committed onto the checkout's `HEAD`
// and a decision log exists, then write the completion JSON *last* — the
// result file's existence is the completion signal the workflow's poll steps
// watch, so nothing may write it early and the write must be atomic.
//
// Deliberately thin: prompt in, agent loop, result JSON + decision log out,
// honest exit codes. No workflow or Vercel SDK imports, no supervision
// logic, and no pushing — the checkout has no push-capable credential, and
// landing is the supervising workflow's job. The pi library itself is
// reached only through `PiCodingAgentGateway` (the churn-absorbing adapter
// in `real-pi-coding-agent-gateway.ts`); this module is pure orchestration
// over the gateway seams and is driven by fakes in tests.
import {
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_RESULT_PATH,
	DISPATCH_SUMMARY_MAX_CHARS,
} from "../dispatch/dispatch-run.ts";

/**
 * The completion the runner reports through the result file — the exact
 * object shape `parseDispatchHarnessResult` on the workflow side accepts.
 */
export interface PiRunnerCompletion {
	readonly outcome: "completed" | "failed";
	readonly summary?: string;
}

export type ReadDispatchedPromptResult =
	| { readonly ok: true; readonly prompt: string | null }
	| { readonly ok: false };

export type DecisionLogExistsResult =
	| { readonly ok: true; readonly hasDecisionLog: boolean }
	| { readonly ok: false };

export type HasUncommittedChangesResult =
	| { readonly ok: true; readonly hasUncommittedChanges: boolean }
	| { readonly ok: false };

export type WorkspaceWriteResult = { readonly ok: true } | { readonly ok: false };

/**
 * Gateway seam over the sandbox checkout the runner works in: the dispatch
 * contract files (prompt, decision log, completion result) and the git
 * state of produced work. The real adapter owns the contract paths and the
 * atomic result write; the runner core speaks only these domain verbs.
 */
export interface DispatchWorkspaceGateway {
	readDispatchedPrompt(): Promise<ReadDispatchedPromptResult>;
	decisionLogExists(): Promise<DecisionLogExistsResult>;
	writeFallbackDecisionLog(content: string): Promise<WorkspaceWriteResult>;
	/**
	 * Write the completion result. This is the run's completion signal: the
	 * adapter must make the file appear atomically (never half-written), and
	 * the runner calls it exactly once, last.
	 */
	writeCompletionResult(completion: PiRunnerCompletion): Promise<WorkspaceWriteResult>;
	hasUncommittedChanges(): Promise<HasUncommittedChangesResult>;
	commitAllChanges(message: string): Promise<WorkspaceWriteResult>;
}

export type PiCodingAgentRunResult =
	| { readonly ok: true; readonly finalAssistantText: string | null }
	| { readonly ok: false; readonly message: string };

/**
 * Gateway seam over the pi coding agent library. One call: run the composed
 * prompt through the agent loop to completion. The pre-1.0 library API is a
 * recorded churn risk, absorbed entirely by the real adapter behind this
 * interface.
 */
export interface PiCodingAgentGateway {
	runPromptToCompletion(options: { readonly prompt: string }): Promise<PiCodingAgentRunResult>;
}

/** The run finished and reported `completed` through the result file. */
export const PI_RUNNER_EXIT_COMPLETED = 0;
/** The run finished and reported `failed` through the result file. */
export const PI_RUNNER_EXIT_FAILED = 1;
/**
 * The result file could not be written: the supervisor sees nothing and the
 * run ends as `run-timed-out` when the budget expires. The most honest exit
 * for the sandbox logs, and the only path that leaves no completion signal.
 */
export const PI_RUNNER_EXIT_RESULT_UNWRITTEN = 2;

export type PiRunnerExitCode =
	| typeof PI_RUNNER_EXIT_COMPLETED
	| typeof PI_RUNNER_EXIT_FAILED
	| typeof PI_RUNNER_EXIT_RESULT_UNWRITTEN;

/** What the runner did, for the process entry to log and exit with. */
export interface PiRunnerReport {
	readonly exitCode: PiRunnerExitCode;
	readonly outcome: "completed" | "failed";
	readonly hasWrittenCompletionResult: boolean;
	readonly detail: string;
}

/**
 * The commit that finalizes work the agent completed but left uncommitted,
 * so the landing push (the checkout's `HEAD`) carries everything produced.
 */
export const PI_RUNNER_FINALIZE_COMMIT_MESSAGE =
	"Commit dispatched work the agent left uncommitted";

/** Written when the agent recorded no decision log of its own. */
export const PI_RUNNER_FALLBACK_DECISION_LOG = "The dispatched agent recorded no decision log.\n";

/**
 * Wrap the dispatched prompt with the headless ground rules the dispatch
 * contract expects from the agent: no interactivity, commit produced work,
 * never push, write the decision log, and never touch the result file (the
 * runner owns the completion signal).
 */
export function composeAgentPrompt(dispatchedPrompt: string): string {
	return [
		"You are running as a headless, non-interactive dispatched agent inside",
		"an isolated sandbox over a fresh checkout of this repository. No human",
		"is watching this run: never ask questions or wait for input — make the",
		"call and record it.",
		"",
		"Ground rules for this run:",
		"",
		'- Do the work described under "Dispatched work" below, following the',
		"  repository's own rules and skills (this checkout carries them).",
		"- Commit completed work onto the current branch with clear commit",
		"  messages. Never push: the checkout has no push credentials, and the",
		"  supervising workflow lands your commits after this run finishes.",
		`- Write your decision log to \`${DISPATCH_DECISION_LOG_PATH}\` (Markdown):`,
		"  every judgment call you made where you would normally have asked.",
		`- Never write \`${DISPATCH_RESULT_PATH}\`. The runner that launched you`,
		"  owns it, and writing it early ends the run's supervision.",
		"",
		"## Dispatched work",
		"",
		dispatchedPrompt,
	].join("\n");
}

/**
 * Run one dispatched unit of work: produce the completion, make sure a
 * decision log exists, then write the completion result last. Every failure
 * the runner can see becomes a `failed` completion written through the same
 * result file, so the supervisor learns the outcome from the contract path
 * instead of burning its whole run budget waiting for a timeout.
 */
export async function runDispatchedPiAgent(options: {
	readonly workspace: DispatchWorkspaceGateway;
	readonly agent: PiCodingAgentGateway;
}): Promise<PiRunnerReport> {
	const { workspace, agent } = options;

	const completion = await produceCompletion(workspace, agent);

	// The decision log must exist before the completion signal: the workflow
	// harvests it immediately after the poll step sees the result file.
	await ensureDecisionLog(workspace);

	const written = await workspace.writeCompletionResult(completion);
	const detail = completion.summary ?? `The run ${completion.outcome} without a summary.`;
	if (!written.ok) {
		return {
			exitCode: PI_RUNNER_EXIT_RESULT_UNWRITTEN,
			outcome: completion.outcome,
			hasWrittenCompletionResult: false,
			detail: `Writing the completion result failed; the supervisor will time the run out. (${detail})`,
		};
	}
	return {
		exitCode: completion.outcome === "completed" ? PI_RUNNER_EXIT_COMPLETED : PI_RUNNER_EXIT_FAILED,
		outcome: completion.outcome,
		hasWrittenCompletionResult: true,
		detail,
	};
}

async function produceCompletion(
	workspace: DispatchWorkspaceGateway,
	agent: PiCodingAgentGateway,
): Promise<PiRunnerCompletion> {
	const promptRead = await workspace.readDispatchedPrompt();
	if (!promptRead.ok) {
		return failedCompletion("Reading the dispatched prompt failed.");
	}
	if (promptRead.prompt === null || promptRead.prompt.trim().length === 0) {
		return failedCompletion("No dispatched prompt was found in the sandbox.");
	}

	let run: PiCodingAgentRunResult;
	try {
		run = await agent.runPromptToCompletion({ prompt: composeAgentPrompt(promptRead.prompt) });
	} catch (error) {
		// The gateway contract returns failures as values; a throw is a broken
		// invariant, but the supervisor still deserves a written outcome.
		run = { ok: false, message: `The pi agent session threw: ${formatError(error)}` };
	}
	if (!run.ok) {
		return failedCompletion(run.message);
	}

	// Finalize: the landing push carries the checkout's HEAD, so work the
	// agent completed but left uncommitted must be committed to land.
	const dirtyRead = await workspace.hasUncommittedChanges();
	if (!dirtyRead.ok) {
		return failedCompletion("Inspecting the checkout for uncommitted work failed.");
	}
	if (dirtyRead.hasUncommittedChanges) {
		const committed = await workspace.commitAllChanges(PI_RUNNER_FINALIZE_COMMIT_MESSAGE);
		if (!committed.ok) {
			return failedCompletion("Committing the agent's uncommitted work failed.");
		}
	}

	const summary = capSummary(run.finalAssistantText);
	return { outcome: "completed", ...(summary === null ? {} : { summary }) };
}

async function ensureDecisionLog(workspace: DispatchWorkspaceGateway): Promise<void> {
	const existsRead = await workspace.decisionLogExists();
	if (existsRead.ok && existsRead.hasDecisionLog) return;
	// Best effort, including when the existence check itself failed: the
	// workflow degrades a missing decision log to `null` rather than failing
	// the run, so a fallback-write failure must not block the result write.
	await workspace.writeFallbackDecisionLog(PI_RUNNER_FALLBACK_DECISION_LOG);
}

function failedCompletion(message: string): PiRunnerCompletion {
	const summary = capSummary(message);
	return { outcome: "failed", ...(summary === null ? {} : { summary }) };
}

function capSummary(text: string | null): string | null {
	if (text === null) return null;
	const trimmed = text.trim();
	if (trimmed.length === 0) return null;
	return trimmed.slice(0, DISPATCH_SUMMARY_MAX_CHARS);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
