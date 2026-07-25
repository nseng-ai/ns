export const BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME = "ns:branch-context:from-plan";
export const BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME =
	"ns:branch-context:upstack-impl-from-plan";
export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "ns:branch-context:impl-attached-plan";
export const WRITE_PLAN_COMMAND_NAME = "ns:plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "ns:plan:grill-and-save";
export const IMPL_SAVED_PLAN_COMMAND_NAME = "ns:plan:impl-saved-plan";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
