// Compatibility shim: @asdl/ccc owns cmux command orchestration.
export {
	buildNewWorkspaceArgs,
	checkoutSlot,
	isSlotCheckoutSuccessEnvelope,
	openBranchInCmuxSlot,
	openCmuxWorkspace,
	parseSlotCheckoutEnvelope,
	slotCheckoutTargetFromData,
} from "../../../ccc/src/cmux/slot.ts";
export type {
	OpenBranchInCmuxSlotOptions,
	OpenCmuxWorkspaceOptions,
	SlotCheckoutEnvelope,
	SlotCheckoutFailureEnvelope,
	SlotCheckoutSuccessEnvelope,
	SlotCheckoutTarget,
} from "../../../ccc/src/cmux/slot.ts";
