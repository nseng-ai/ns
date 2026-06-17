import { BRANCH_CONTEXT_LEGACY_PLAN_KEY } from "./constants.ts";

export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "sdl:branch-context:impl-attached-plan";

export function formatImplBranchContextCommand(key: string): string {
	if (key === BRANCH_CONTEXT_LEGACY_PLAN_KEY) {
		return "/sdl:branch-context:impl-attached-plan";
	}
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
