/**
 * Distinguishes a guardrail that declined to run (`refusal`, rendered warn per house-style §7.3)
 * from a real workflow failure (`failure`, rendered error). Failure classification lives with the
 * typed failure arm that owns the verdict and rendered message.
 */
export type AutobranchFlowOutcome = "refusal" | "failure";

export type AutobranchFlowResult =
	| { ok: true; isClean: boolean; summary: string; warnings: string[] }
	| { ok: false; outcome: AutobranchFlowOutcome; error: string };
