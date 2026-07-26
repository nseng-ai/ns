import type { ExecResult } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type {
	LandingExecutionFailure,
	LandingFailure,
	LandOutcome,
	LandResult,
	NotifyLevel,
} from "./types.ts";

export type { LandingExecutionFailure, LandingFailure, LandOutcome, LandResult } from "./types.ts";

export interface LandingExecutionFailureOptions {
	level?: NotifyLevel;
	displayCommand?: string;
	execResult?: ExecResult;
	failedBranch?: string;
	failedPrNumber?: number;
	suggestedAction?: string;
	/**
	 * House-style visual intent (§7.3). A declined guardrail (cancellation, missing confirmation
	 * channel, base-branch mismatch) is a `refusal` (warn), not a red subprocess `failure`, even when
	 * it is notified at `error` level to flip the exit code. Defaults to `failure`.
	 */
	outcome?: "refusal" | "failure";
	refusalReason?: "declined" | "non-interactive";
}

export type LandingFailureFacts = Omit<LandingExecutionFailure, "type">;

export function landingFailureFacts(failure: LandingFailure): LandingFailureFacts {
	switch (failure.type) {
		case "execution":
			return {
				level: failure.level,
				outcome: failure.outcome,
				message: failure.message,
				...optionalEntry("displayCommand", failure.displayCommand),
				...optionalEntry("execResult", failure.execResult),
				...optionalEntry("failedBranch", failure.failedBranch),
				...optionalEntry("failedPrNumber", failure.failedPrNumber),
				...optionalEntry("suggestedAction", failure.suggestedAction),
				...optionalEntry("refusalReason", failure.refusalReason),
			};
		case "boundary":
			return {
				level: "error",
				outcome: "failure",
				message: failure.message,
				...optionalEntry("displayCommand", failure.displayCommand),
				...optionalEntry("execResult", failure.execResult),
				...optionalEntry("suggestedAction", failure.suggestedAction),
			};
		case "domain":
			return {
				level: "error",
				outcome: "failure",
				message: failure.message,
				...optionalEntry("failedBranch", failure.failedBranch),
				...optionalEntry("failedPrNumber", failure.failedPrNumber),
				...optionalEntry("suggestedAction", failure.suggestedAction),
			};
		case "not-implemented":
			return { level: "error", outcome: "failure", message: failure.message };
	}
}

export function landingExecutionFailure(
	message: string,
	options: LandingExecutionFailureOptions = {},
): LandingExecutionFailure {
	return {
		type: "execution",
		level: options.level ?? "error",
		message,
		...optionalEntry("displayCommand", options.displayCommand),
		...optionalEntry("execResult", options.execResult),
		...optionalEntry("failedBranch", options.failedBranch),
		...optionalEntry("failedPrNumber", options.failedPrNumber),
		...optionalEntry("suggestedAction", options.suggestedAction),
		outcome: options.outcome ?? "failure",
		...optionalEntry("refusalReason", options.refusalReason),
	};
}

/**
 * Shared cancellation failure for a declined main or pre-merge confirmation. One constructor keeps
 * the refusal semantics and rendered wording identical across confirmation sites.
 */
export function landingCancelledBeforeMergeFailure(): LandingExecutionFailure {
	return landingExecutionFailure("Cancelled before merge; no PRs were landed.", {
		level: "info",
		outcome: "refusal",
		refusalReason: "declined",
	});
}

/**
 * Return the same failure variant with only the suggested action replaced. Preserves boundary
 * source/code, display command, exec result, domain reason, failed branch/PR, and refusal
 * classification instead of reconstructing a message-only execution failure.
 */
export function withSuggestedAction(
	failure: LandingFailure,
	suggestedAction: string,
): LandingFailure {
	switch (failure.type) {
		case "boundary":
		case "domain":
		case "execution":
			return { ...failure, suggestedAction };
		case "not-implemented":
			return failure;
	}
}

export function landSuccess<T>(value: T): LandResult<T> {
	return { type: "success", value };
}

export function landFailure<T = never>(failure: LandingFailure): LandResult<T> {
	return { type: "failure", failure };
}

export function landCompleted(): LandOutcome {
	return { type: "completed" };
}

export function landOutcomeFailure(failure: LandingFailure): LandOutcome {
	return { type: "failure", failure };
}

export function isLandFailure<T>(
	result: LandResult<T> | LandOutcome,
): result is Extract<LandResult<T> | LandOutcome, { readonly type: "failure" }> {
	return result.type === "failure";
}

export function emptyResult(): ExecResult {
	return { type: "exited", stdout: "", stderr: "", code: 1, signal: null };
}
