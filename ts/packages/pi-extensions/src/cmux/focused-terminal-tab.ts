// Compatibility shim: @asdl/ccc owns focused cmux terminal-tab orchestration.
export {
	createCmuxSurface,
	identifyCmuxCaller,
	parseCmuxCallerContext,
	parseCreatedCmuxSurface,
	renameCmuxTab,
	sendCmuxText,
} from "@asdl/ccc/cmux/focused-terminal-tab";
export type {
	CmuxCallerContext,
	CmuxCreatedSurface,
	CmuxExecHost,
	CmuxSendOptions,
	CmuxTabOptions,
	CreateCmuxSurfaceOptions,
} from "@asdl/ccc/cmux/focused-terminal-tab";
