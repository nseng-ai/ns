import type { ExecResult } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { LandingFailure } from "../types.ts";
import type { NotifyLevel } from "./types.ts";

export interface LandStackFailureOptions {
	level?: NotifyLevel;
	commandDisplay?: string;
	result?: ExecResult;
	failedBranch?: string;
	failedPr?: number;
	suggestedAction?: string;
	/**
	 * House-style visual intent (§7.3). A declined guardrail (cancellation, missing confirmation
	 * channel, base-branch mismatch) is a `refusal` (warn), not a red subprocess `failure`, even when
	 * it is notified at `error` level to flip the exit code. Defaults to `failure`.
	 */
	outcome?: "refusal" | "failure";
	refusalReason?: "declined" | "non-interactive";
}

export interface LandingExecutionFailure {
	type: "execution";
	level: NotifyLevel;
	message: string;
	displayCommand?: string;
	execResult?: ExecResult;
	failedBranch?: string;
	failedPrNumber?: number;
	suggestedAction?: string;
	outcome: "refusal" | "failure";
	refusalReason?: "declined" | "non-interactive";
}

export type LandFlowFailure = LandingFailure | LandingExecutionFailure;

export type LandFlowFailureFacts = Omit<LandingExecutionFailure, "type">;

export function landFlowFailureFacts(failure: LandFlowFailure): LandFlowFailureFacts {
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

export type LandStackResult<T> =
	| { type: "success"; value: T }
	| { type: "failure"; failure: LandFlowFailure };

export type LandStackOutcome = LandStackResult<void>;

export function landStackFailure(
	message: string,
	options: LandStackFailureOptions = {},
): LandingExecutionFailure {
	return {
		type: "execution",
		level: options.level ?? "error",
		message,
		...optionalEntry("displayCommand", options.commandDisplay),
		...optionalEntry("execResult", options.result),
		...optionalEntry("failedBranch", options.failedBranch),
		...optionalEntry("failedPrNumber", options.failedPr),
		...optionalEntry("suggestedAction", options.suggestedAction),
		outcome: options.outcome ?? "failure",
		...optionalEntry("refusalReason", options.refusalReason),
	};
}

export function success<T>(value: T): LandStackResult<T> {
	return { type: "success", value };
}

export function failure<T = never>(landFlowFailure: LandFlowFailure): LandStackResult<T> {
	return { type: "failure", failure: landFlowFailure };
}

export function completed(): LandStackOutcome {
	return success(undefined);
}

export function isFailure<T>(
	result: LandStackResult<T>,
): result is Extract<LandStackResult<T>, { type: "failure" }> {
	return result.type === "failure";
}

export function emptyResult(): ExecResult {
	return { stdout: "", stderr: "", code: 1, killed: false };
}
