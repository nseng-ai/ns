// Flow-side confirmation approval policy.
//
// Maps explicit ParsedArgs flags and an optional cleanup preview into the canonical
// confirmation request kinds those flags authorize. Interactive main-plan approval is
// handled by the confirmation gateway and never grants authority to separate actions.

import type { LandConfirmationRequest } from "./execution/host-seams.ts";
import type { PostLandingSlotCleanupPreview } from "./execution/post-landing-cleanup.ts";
import type { ParsedArgs } from "./stack/types.ts";

export function approvedLandConfirmationKinds(options: {
	readonly flags: Pick<ParsedArgs, "isDryRun" | "shouldSkipConfirmation" | "shouldForceCleanup">;
	readonly cleanupPreview?: PostLandingSlotCleanupPreview;
}): ReadonlySet<LandConfirmationRequest["kind"]> {
	const approved = new Set<LandConfirmationRequest["kind"]>();
	if (options.flags.isDryRun) return approved;
	if (options.flags.shouldSkipConfirmation) {
		approved.add("main-landing");
		approved.add("isolated-main-landing");
	}
	if (
		options.cleanupPreview !== undefined &&
		(options.flags.shouldSkipConfirmation || options.flags.shouldForceCleanup)
	) {
		approved.add("post-landing-cleanup");
	}
	return approved;
}
