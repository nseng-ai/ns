// Flow-side glue for post-landing managed-slot cleanup.
//
// Canonical stack execution owns cleanup end to end; this module keeps the deterministic
// ParsedArgs -> cleanup policy mapping and the single-branch fast-path glue that still runs
// cleanup outside canonical stack execution.

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { LandExecutionStatusProgress } from "./execution/host-seams.ts";
import {
	planManagedSlotPostLandingCleanup,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
	type PostLandingSlotCleanupPreview,
} from "./execution/post-landing-cleanup.ts";
import { setStatus } from "./land-presentation.ts";
import type { PrintAwareLandStackCommandContext, ParsedArgs } from "./stack/types.ts";
import type {
	LandContext,
	LandingCleanupPolicy,
	LandingFailure,
	LandingShape,
	PostLandingSlotCleanupReport,
} from "./types.ts";

export type { PostLandingSlotCleanupPreview };

/**
 * Deterministic flag-to-policy mapping: `preserve` is the default and `--free` opts into freeing
 * the current managed slot. `--yes` stays approval state, not a cleanup policy.
 */
export function landingCleanupPolicyFromArgs(
	args: Pick<ParsedArgs, "shouldFreeSlot">,
): LandingCleanupPolicy {
	return args.shouldFreeSlot ? "free" : "preserve";
}

export function postLandingCleanupRequestFromArgs(
	args: Pick<ParsedArgs, "isDryRun" | "shouldFreeSlot">,
): PostLandingCleanupRequest {
	return {
		mode: args.isDryRun ? "dry-run" : "execute",
		policy: landingCleanupPolicyFromArgs(args),
	};
}

export function planPostLandingSlotCleanup(options: {
	readonly args: ParsedArgs;
	readonly shape: LandingShape;
}): PostLandingSlotCleanupPreview | undefined {
	return planManagedSlotPostLandingCleanup({
		cleanup: postLandingCleanupRequestFromArgs(options.args),
		shape: options.shape,
	});
}

interface RunPostLandingSlotCleanupOptions {
	readonly landContext: LandContext;
	readonly ctx: PrintAwareLandStackCommandContext;
	readonly args: ParsedArgs;
	readonly shape: LandingShape;
	readonly chosenCleanupPolicy?: LandingCleanupPolicy;
}

/** Single-branch fast-path glue: run cleanup after landing outside canonical stack execution. */
export type FlowPostLandingCleanupResult =
	| {
			readonly type: "completed";
			readonly cleanup: PostLandingSlotCleanupReport;
	  }
	| {
			readonly type: "failure";
			readonly cleanup: PostLandingSlotCleanupReport;
			readonly failure: LandingFailure;
	  };

export async function runPostLandingSlotCleanup(
	options: RunPostLandingSlotCleanupOptions,
): Promise<FlowPostLandingCleanupResult> {
	const result = await runManagedSlotPostLandingCleanup({
		landContext: options.landContext,
		progress: createCleanupProgress(options.ctx),
		cleanup: {
			...postLandingCleanupRequestFromArgs(options.args),
			...optionalEntry("policy", options.chosenCleanupPolicy),
		},
		shape: options.shape,
	});
	if (result.type === "failure") {
		return { type: "failure", cleanup: result.outcome, failure: result.failure };
	}
	return { type: "completed", cleanup: result.outcome };
}

export function createCleanupProgress(
	ctx: PrintAwareLandStackCommandContext,
): LandExecutionStatusProgress {
	return {
		setStatus: (message) => setStatus(ctx, message),
	};
}
