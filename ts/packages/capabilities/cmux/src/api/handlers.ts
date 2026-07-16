export { CMUX_PACKAGE_IDENTITY } from "./index.ts";

// Canonical ns:cmux:* command surface names
export {
	CMUX_COMMAND_NAMES,
	CMUX_SIDEBAR_OBJECTIVE_SUMMARY_COMMAND_NAME,
	CMUX_SURFACE_DISPATCH_PLAN_COMMAND_NAME,
	CMUX_WORKSPACE_DISPATCH_FROM_TRUNK_COMMAND_NAME,
	CMUX_WORKSPACE_DISPATCH_PLAN_COMMAND_NAME,
	CMUX_WORKSPACE_DISPATCH_PROMPT_COMMAND_NAME,
	CMUX_WORKSPACE_OPEN_BRANCH_COMMAND_NAME,
} from "../core/command-surfaces.ts";

// Dispatch prompt
export {
	handleCccSlotDispatchPrompt,
	resolveDispatchPromptPayloadOptions,
	type DispatchPromptPayloadOptions,
	type HandleCccSlotDispatchPromptOptions,
} from "../core/dispatch-prompt.ts";

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
	type CccSidebarController,
} from "../core/sidebar.ts";

// Slot client
export type { SlotClient } from "@nseng-ai/slots/api";
