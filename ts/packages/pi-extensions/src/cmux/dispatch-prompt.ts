// Compatibility shim: @asdl/ccc owns cmux command orchestration.
export {
	buildLaunchPrompt,
	createTrackedBranchForPrompt,
	handleCmuxSlotDispatchPrompt,
	registerCmuxSlotDispatchPromptCommand,
	writePromptFile,
} from "../../../ccc/src/cmux/dispatch-prompt.ts";
export type {
	CmuxSlotDispatchPromptOptions,
	HandleCmuxSlotDispatchPromptOptions,
	ResolvedCmuxSlotDispatchPromptOptions,
} from "../../../ccc/src/cmux/dispatch-prompt.ts";
