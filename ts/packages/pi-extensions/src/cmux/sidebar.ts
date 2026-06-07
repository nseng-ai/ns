// Compatibility shim: @asdl/ccc owns cmux command orchestration.
export {
	buildCmuxSidebarPrompt,
	createCmuxSidebarController,
	getCallerWorkspaceId,
	registerCmuxSidebarCommands,
} from "../../../ccc/src/cmux/sidebar.ts";
export type { CmuxSidebarController } from "../../../ccc/src/cmux/sidebar.ts";
