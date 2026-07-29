// Flow-side confirmation approval policy.
//
// Maps explicit ParsedArgs flags into the canonical confirmation request kinds those flags
// authorize. Interactive main-plan approval is handled by the confirmation gateway and never
// grants authority to separate actions. Post-landing cleanup has no confirmation of its own:
// the explicit `--free` flag is the consent.

import type { LandConfirmationRequest } from "./execution/host-seams.ts";
import type { ParsedArgs } from "./stack/types.ts";

export function approvedLandConfirmationKinds(options: {
	readonly flags: Pick<ParsedArgs, "isDryRun" | "shouldSkipConfirmation">;
}): ReadonlySet<LandConfirmationRequest["kind"]> {
	const approved = new Set<LandConfirmationRequest["kind"]>();
	if (options.flags.isDryRun) return approved;
	if (options.flags.shouldSkipConfirmation) {
		approved.add("main-landing");
		approved.add("single-branch-main-landing");
	}
	return approved;
}
