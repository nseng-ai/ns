export const GIT_NEW_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:git:new-branch-from-plan";
export const GIT_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:git:impl-branch-from-plan";
export const GT_NEW_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:gt:new-branch-from-plan";
export const GT_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:gt:impl-branch-from-plan";
export const GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:gs:new-branch-from-plan";
export const GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME = "ns:gs:impl-branch-from-plan";
export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "ns:branch-context:impl-attached-plan";
export const WRITE_PLAN_COMMAND_NAME = "ns:plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "ns:plan:grill-and-save";
export const IMPL_SAVED_PLAN_COMMAND_NAME = "ns:plan:impl-saved-plan";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
