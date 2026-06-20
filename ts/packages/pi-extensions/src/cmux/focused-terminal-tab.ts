// Compatibility shim: @sdl/ccc owns focused cmux terminal-tab orchestration.
export {
	createCmuxSurface,
	identifyCmuxCaller,
	parseCmuxCallerContext,
	parseCreatedCmuxSurface,
	renameCmuxTab,
	sendCmuxText,
} from "@sdl/ccc/cmux/focused-terminal-tab";
export type {
	CmuxCallerContext,
	CmuxCreatedSurface,
	CmuxExecHost,
	CmuxSendOptions,
	CmuxTabOptions,
	CreateCmuxSurfaceOptions,
} from "@sdl/ccc/cmux/focused-terminal-tab";
