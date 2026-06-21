import { IMPL_BRANCH_CONTEXT_COMMAND_NAME as SHARED_IMPL_BRANCH_CONTEXT_COMMAND_NAME } from "@sdl/pi-command-surfaces";

import { BRANCH_CONTEXT_LEGACY_PLAN_KEY } from "./constants.ts";

export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = SHARED_IMPL_BRANCH_CONTEXT_COMMAND_NAME;

export function formatImplBranchContextCommand(key: string): string {
	if (key === BRANCH_CONTEXT_LEGACY_PLAN_KEY) {
		return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME}`;
	}
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
