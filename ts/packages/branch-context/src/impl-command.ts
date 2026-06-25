import { IMPL_BRANCH_CONTEXT_COMMAND_NAME } from "@sdl/pi/commands";

export { IMPL_BRANCH_CONTEXT_COMMAND_NAME } from "@sdl/pi/commands";

export function formatImplBranchContextCommand(key: string): string {
	return `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} ${key}`;
}
