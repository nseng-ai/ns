// Compatibility shim: @asdl/ccc owns cmux command orchestration.
export {
	extractCommandArgumentPrefix,
	findLatestPlannedBranchSelection,
	getBranchCompletions,
	handleCmuxSlotOpenBranch,
	registerCmuxSlotOpenBranchCommand,
} from "../../../ccc/src/cmux/slot-open-branch.ts";
export type { HandleCmuxSlotOpenBranchOptions } from "../../../ccc/src/cmux/slot-open-branch.ts";
