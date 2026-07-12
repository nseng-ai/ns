// Renderer-independent structural command builders for land confirmation requests.
//
// Confirmation details, non-interactive refusal text, and suggested actions must all derive from
// these lists instead of re-assembling commands per call site or reverse-parsing rendered prose.

import { formatCommand } from "@nseng-ai/foundation/command";

import {
	deleteLocalBranchOperation,
	formatGraphiteOperation,
	restackOperation,
} from "./graphite-operations.ts";
import type { LandConfirmationRequest } from "./execution/host-seams.ts";
import type { PrSubmitRequirement } from "./types.ts";

/** Commands a submit-required-updates confirmation would run, in execution order. */
export function submitRequiredUpdatesCommands(
	request: Pick<
		Extract<LandConfirmationRequest, { readonly kind: "submit-required-updates" }>,
		"landingTargetBranch" | "restackTarget"
	>,
): readonly string[] {
	return [
		...(request.restackTarget === undefined
			? []
			: [
					formatGraphiteOperation(
						restackOperation({ branch: request.restackTarget, scope: "upstack" }),
					),
				]),
		formatGraphiteOperation({ kind: "submit-update", branch: request.landingTargetBranch }),
	];
}

/** Commands a post-landing-cleanup confirmation would run, in execution order. */
export function postLandingCleanupCommands(
	request: Pick<
		Extract<LandConfirmationRequest, { readonly kind: "post-landing-cleanup" }>,
		"branch" | "slotName" | "localBranchDisposition"
	>,
): readonly string[] {
	return [
		formatCommand("ns", ["slot", "free", "--wt", request.slotName]),
		...(request.localBranchDisposition === "keep-trunk"
			? []
			: [formatGraphiteOperation(deleteLocalBranchOperation({ branch: request.branch }))]),
	];
}

/** Shared PR-requirement line used by pre-merge failure messages and confirmation details. */
export function formatPrSubmitRequirementLine(
	requirement: Pick<PrSubmitRequirement, "branch" | "prNumber" | "reasons">,
): string {
	return `- #${requirement.prNumber} ${requirement.branch}: ${requirement.reasons.join("; ")}`;
}
