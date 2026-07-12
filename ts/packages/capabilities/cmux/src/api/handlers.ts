export { CMUX_PACKAGE_IDENTITY } from "./index.ts";

// Canonical ns:ccc:* command surface names
export {
	CCC_CLAUDE_PLAN_TAB_COMMAND_NAME,
	CCC_COMMAND_NAMES,
	CCC_SIDEBAR_BRANCH_STATE_SUMMARY_COMMAND_NAME,
	CCC_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
	CCC_SIDEBAR_SESSION_SUMMARY_COMMAND_NAME,
	CCC_SURFACE_DISPATCH_PLAN_COMMAND_NAME,
	CCC_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME,
	CCC_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME,
	CCC_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME,
	CCC_WORKSPACE_OPEN_BRANCH_COMMAND_NAME,
} from "../core/command-surfaces.ts";

// Dispatch prompt
export {
	handleCccSlotDispatchPrompt,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
	type HandleCccSlotDispatchPromptOptions,
} from "../core/dispatch-prompt.ts";

// Claude plan tab
export {
	handleCccClaudePlanTab,
	extractLastAssistantText,
	buildClaudePlanTabTitle,
	buildClaudePlanLaunchCommand,
} from "../core/claude-plan-tab.ts";

// Prompt file utilities
export {
	resolvePromptFileOptions,
	writeTimestampedPromptFile,
	type PromptFileOptions,
	type ResolvedPromptFileOptions,
} from "../core/prompt-file.ts";

// Dispatch from trunk
export {
	handleCccSlotDispatchFromTrunk,
	createTrackedBranchFromTrunkForPrompt,
} from "../core/dispatch-from-trunk.ts";

// Slot open branch
export {
	handleCccSlotOpenBranch,
	getBranchCompletions,
	extractCommandArgumentPrefix,
	type HandleCccSlotOpenBranchOptions,
	type CccSlotOpenBranchOptions,
} from "../core/slot-open-branch.ts";

// Slot dispatch plan
export {
	handleCccSlotDispatchPlan,
	type CccSlotDispatchPlanOptions,
	type DispatchPlanConfig,
	type DispatchDestination,
} from "../core/slot-dispatch-plan.ts";

// Sidebar
export {
	createCccSidebarController,
	getCallerWorkspaceId,
	buildCmuxSessionSidebarPrompt,
	buildCmuxBranchStateSidebarPrompt,
	type CccSidebarController,
	type ObjectiveSidebarHandlerOptions,
} from "../core/sidebar.ts";

// Slot client
export type { SlotClient } from "@nseng-ai/slots/api";
