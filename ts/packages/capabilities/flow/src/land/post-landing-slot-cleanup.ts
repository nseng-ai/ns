// Flow-side glue for post-landing managed-slot cleanup.
//
// Canonical stack execution owns cleanup end to end; this module keeps the deterministic
// ParsedArgs -> cleanup policy mapping, the upfront-confirmation preview, and the isolated
// fast-path glue that still runs cleanup outside canonical stack execution.

import type { LandConfirmationRequest, LandExecutionProgress } from "./execution/host-seams.ts";
import {
	planManagedSlotPostLandingCleanup,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
	type PostLandingSlotCleanupDecision,
	type PostLandingSlotCleanupPreview,
} from "./execution/post-landing-cleanup.ts";
import { notifyPrintAware, presentFailureAndReturn, setStatus } from "./land-presentation.ts";
import { landCompleted, landOutcomeFailure, type LandOutcome } from "./results.ts";
import type { PrintAwareLandStackCommandContext, ParsedArgs } from "./stack/types.ts";
import type { LandContext, LandingCleanupPolicy, LandingShape } from "./types.ts";

export type { PostLandingSlotCleanupDecision, PostLandingSlotCleanupPreview };

export function approvedLandConfirmationKinds(options: {
	readonly flags: Pick<ParsedArgs, "isDryRun" | "shouldSkipConfirmation">;
	readonly hasUpfrontPromptApproval: boolean;
	readonly cleanupPreview?: PostLandingSlotCleanupPreview;
}): ReadonlySet<LandConfirmationRequest["kind"]> {
	if (options.flags.isDryRun) return new Set();
	if (!options.flags.shouldSkipConfirmation && !options.hasUpfrontPromptApproval) return new Set();
	return new Set<LandConfirmationRequest["kind"]>([
		"main-landing",
		...(options.hasUpfrontPromptApproval
			? (["free-managed-slots", "submit-required-updates"] as const)
			: []),
		...(options.cleanupPreview === undefined ? [] : (["post-landing-cleanup"] as const)),
	]);
}

/**
 * Deterministic flag-to-policy mapping: `--preserve` wins over `--force`, and ordinary execution
 * in a managed slot lands as `free-slot`. `--yes` stays approval state, not a cleanup policy.
 */
export function landingCleanupPolicyFromArgs(
	args: Pick<ParsedArgs, "shouldPreserveSlot" | "shouldForceCleanup">,
): LandingCleanupPolicy {
	if (args.shouldPreserveSlot) return "preserve";
	if (args.shouldForceCleanup) return "force-cleanup";
	return "free-slot";
}

export function postLandingCleanupRequestFromArgs(
	args: Pick<ParsedArgs, "isDryRun" | "shouldPreserveSlot" | "shouldForceCleanup">,
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
	readonly cleanupDecision: PostLandingSlotCleanupDecision;
}

/** Isolated fast-path glue: run cleanup after landing outside canonical stack execution. */
export async function runPostLandingSlotCleanup(
	options: RunPostLandingSlotCleanupOptions,
): Promise<LandOutcome> {
	const result = await runManagedSlotPostLandingCleanup({
		landContext: options.landContext,
		progress: createCleanupProgress(options.ctx),
		cleanup: postLandingCleanupRequestFromArgs(options.args),
		shape: options.shape,
		cleanupDecision: options.cleanupDecision,
	});
	if (result.type === "failure") {
		presentFailureAndReturn(options.ctx, result.failure);
		return landOutcomeFailure(result.failure);
	}
	if (result.successMessage !== undefined) {
		notifyPrintAware({
			ctx: options.ctx,
			message: result.successMessage,
			level: "success",
			kind: "success",
		});
	}
	return landCompleted();
}

export function createCleanupProgress(
	ctx: PrintAwareLandStackCommandContext,
): LandExecutionProgress {
	return {
		note() {},
		setStatus: (message) => setStatus(ctx, message),
		setStep() {},
		recordMergedPullRequest() {},
		planRecalculated() {},
	};
}
