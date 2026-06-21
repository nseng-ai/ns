import { IMPL_BRANCH_CONTEXT_COMMAND_NAME as SHARED_IMPL_BRANCH_CONTEXT_COMMAND_NAME } from "@sdl/pi-command-surfaces";

export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = SHARED_IMPL_BRANCH_CONTEXT_COMMAND_NAME;

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
