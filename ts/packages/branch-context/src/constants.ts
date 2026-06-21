import { buildPlanFileName, validatePlanSlug } from "@sdl/plans";

export const BRANCH_CONTEXT_NAMESPACE = "branch-context";
export const UNSUPPORTED_ATTACHED_PLAN_KEY = "plan.md";

export function buildBranchContextPlanKey(slug: string): string {
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid branch context slug: ${slugError}`);
	}
	return buildPlanFileName(slug);
}
