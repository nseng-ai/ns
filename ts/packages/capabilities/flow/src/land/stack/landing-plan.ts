import { buildStackLandingPlan } from "../api.ts";
import type { LandContext, LandingPlan, PrSubmitRequirement } from "../api.ts";
import { failure, success, type LandStackResult } from "./errors.ts";

export async function buildLandingPlan(
	landContext: LandContext,
	cwd: string,
	options: {
		shouldAllowSubmitRequiredState?: boolean;
		landingBranchLimit?: number;
	} = {},
): Promise<LandStackResult<LandingPlan>> {
	const landPlan = await buildStackLandingPlan(landContext, cwd, {
		shouldAllowSubmitRequiredState: Boolean(options.shouldAllowSubmitRequiredState),
		...(options.landingBranchLimit === undefined
			? {}
			: { landingBranchLimit: options.landingBranchLimit }),
	});
	if (landPlan.type === "failure") return failure(landPlan.failure);

	return success(landPlan.value);
}

export function formatPrSubmitRequirement(
	requirement: Pick<PrSubmitRequirement, "branch" | "prNumber" | "reasons">,
): string {
	return `- #${requirement.prNumber} ${requirement.branch}: ${requirement.reasons.join("; ")}`;
}
