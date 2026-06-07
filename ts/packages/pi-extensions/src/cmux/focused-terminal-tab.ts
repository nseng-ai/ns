// Compatibility shim: @asdl/ccc owns focused cmux terminal-tab orchestration.
export {
	createCmuxSurface,
	identifyCmuxCaller,
	parseCmuxCallerContext,
	parseCreatedCmuxSurface,
	renameCmuxTab,
	sendCmuxText,
} from "../../../ccc/src/cmux/focused-terminal-tab.ts";
export type {
	CmuxCallerContext,
	CmuxCreatedSurface,
	CmuxExecHost,
	CmuxSendOptions,
	CmuxTabOptions,
	CreateCmuxSurfaceOptions,
} from "../../../ccc/src/cmux/focused-terminal-tab.ts";
