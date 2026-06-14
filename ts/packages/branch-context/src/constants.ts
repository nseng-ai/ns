import { buildPlanFileName, validatePlanSlug } from "@asdl/plans";

export const BRANCH_CONTEXT_NAMESPACE = "branch-context";
export const BRANCH_CONTEXT_LEGACY_PLAN_KEY = "plan.md";
// Backwards-compatible alias for legacy plan.md storage; new attachments should use buildBranchContextPlanKey.
export const BRANCH_CONTEXT_PLAN_KEY = BRANCH_CONTEXT_LEGACY_PLAN_KEY;

export function buildBranchContextPlanKey(slug: string): string {
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw new Error(`Invalid branch context slug: ${slugError}`);
	}
	return buildPlanFileName(slug);
}
