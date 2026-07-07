import { buildStackLandingPlan } from "../api.ts";
import type { LandContext, LandingFailure, LandingPlan, PrSubmitRequirement } from "../api.ts";
import {
	failure,
	landStackFailure,
	success,
	type LandStackFailure,
	type LandStackResult,
} from "./errors.ts";

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
	if (landPlan.type === "failure") return failure(toLandStackFailure(landPlan.failure));

	return success(landPlan.value);
}

export function toLandStackFailure(failureValue: LandingFailure): LandStackFailure {
	if (failureValue.type === "domain") {
		const options = landStackFailureOptionsForDomainFailure(failureValue);
		if (failureValue.reason === "dirty-worktree") {
			return landStackFailure("Working tree is dirty; refusing to start stack landing.", options);
		}
		return landStackFailure(failureValue.message, options);
	}
	return landStackFailure(failureValue.message, boundaryFailureOptions(failureValue));
}

function boundaryFailureOptions(
	failureValue: Exclude<LandingFailure, { readonly type: "domain" }>,
) {
	if (failureValue.type !== "boundary") return {};
	return {
		...(failureValue.displayCommand === undefined
			? {}
			: { commandDisplay: failureValue.displayCommand }),
		...(failureValue.execResult === undefined ? {} : { result: failureValue.execResult }),
		...(failureValue.suggestedAction === undefined
			? {}
			: { suggestedAction: failureValue.suggestedAction }),
	};
}

function landStackFailureOptionsForDomainFailure(
	failureValue: Extract<LandingFailure, { readonly type: "domain" }>,
) {
	return {
		...(failureValue.failedBranch === undefined ? {} : { failedBranch: failureValue.failedBranch }),
		...(failureValue.failedPrNumber === undefined ? {} : { failedPr: failureValue.failedPrNumber }),
		...(failureValue.suggestedAction === undefined
			? {}
			: { suggestedAction: failureValue.suggestedAction }),
	};
}

export function formatPrSubmitRequirement(
	requirement: Pick<PrSubmitRequirement, "branch" | "prNumber" | "reasons">,
): string {
	return `- #${requirement.prNumber} ${requirement.branch}: ${requirement.reasons.join("; ")}`;
}
