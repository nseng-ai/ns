import { BRANCH_CONTEXT_PLAN_KEY } from "./constants.ts";

export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "branch-context:impl";

export function formatImplBranchContextCommand(key: string): string {
	if (key === BRANCH_CONTEXT_PLAN_KEY) {
		return "/branch-context:impl";
	}
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
