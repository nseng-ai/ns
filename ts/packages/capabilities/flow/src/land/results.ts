import type { LandingFailure, LandOutcome, LandResult } from "./types.ts";

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
