export const GIT_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:git:branch-from-plan";
export const GIT_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME = "ns:git:branch-and-impl-from-plan";
export const GT_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:gt:branch-from-plan";
export const GT_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME = "ns:gt:branch-and-impl-from-plan";
export const GS_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:gs:branch-from-plan";
export const GS_BRANCH_AND_IMPL_FROM_PLAN_COMMAND_NAME = "ns:gs:branch-and-impl-from-plan";
export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "ns:branch-context:impl-attached-plan";
export const WRITE_PLAN_COMMAND_NAME = "ns:plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "ns:plan:grill-and-save";
export const IMPL_SAVED_PLAN_COMMAND_NAME = "ns:plan:impl-saved-plan";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
