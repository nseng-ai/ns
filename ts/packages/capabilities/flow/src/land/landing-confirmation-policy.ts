// Flow-side upfront confirmation approval policy.
//
// Maps ParsedArgs flags, the observed interactive upfront prompt outcome, and an optional
// cleanup preview into the confirmation request kinds the upfront-approved gateway may
// approve without prompting again. This is adapter-layer policy: ParsedArgs and prompt
// provenance stay out of the land execution core.

import type { LandConfirmationRequest } from "./execution/host-seams.ts";
import type { PostLandingSlotCleanupPreview } from "./execution/post-landing-cleanup.ts";
import type { ParsedArgs } from "./stack/types.ts";

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
