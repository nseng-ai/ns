export { CCC_PACKAGE_IDENTITY } from "./index.ts";

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
export type { SlotClient } from "@sdl/slot/api";
