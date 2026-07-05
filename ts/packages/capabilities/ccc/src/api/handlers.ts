export { CCC_PACKAGE_IDENTITY } from "./index.ts";

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
} from "../cmux/command-surfaces.ts";

// Dispatch prompt
export {
	handleCccSlotDispatchPrompt,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
	type HandleCccSlotDispatchPromptOptions,
} from "../cmux/dispatch-prompt.ts";

// Claude plan tab
export {
	handleCccClaudePlanTab,
	extractLastAssistantText,
	buildClaudePlanTabTitle,
	buildClaudePlanLaunchCommand,
} from "../cmux/claude-plan-tab.ts";

// Prompt file utilities
export {
	resolvePromptFileOptions,
	writeTimestampedPromptFile,
	type PromptFileOptions,
	type ResolvedPromptFileOptions,
} from "../cmux/prompt-file.ts";

// Dispatch from trunk
export {
	handleCccSlotDispatchFromTrunk,
	createTrackedBranchFromTrunkForPrompt,
} from "../cmux/dispatch-from-trunk.ts";

// Slot open branch
export {
	handleCccSlotOpenBranch,
	getBranchCompletions,
	extractCommandArgumentPrefix,
	type HandleCccSlotOpenBranchOptions,
	type CccSlotOpenBranchOptions,
} from "../cmux/slot-open-branch.ts";

// Slot dispatch plan
export {
	handleCccSlotDispatchPlan,
	type CccSlotDispatchPlanOptions,
	type DispatchPlanConfig,
	type DispatchDestination,
} from "../cmux/slot-dispatch-plan.ts";

// Sidebar
export {
	createCccSidebarController,
	getCallerWorkspaceId,
	buildCmuxSessionSidebarPrompt,
	buildCmuxBranchStateSidebarPrompt,
	type CccSidebarController,
	type ObjectiveSidebarHandlerOptions,
} from "../cmux/sidebar.ts";

// Slot client
export type { SlotClient } from "@nseng-ai/slot/api";
