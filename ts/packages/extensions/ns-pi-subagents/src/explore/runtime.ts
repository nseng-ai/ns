import {
	createFunctionSubagentRuntime,
	createSubprocessSubagentRuntime,
	type SubagentRuntime,
	type SubagentRuntimeDispatchFunction,
	type SubagentRuntimeDispatchInput,
} from "../runtime/seam.ts";

export type ExplorerRuntimeDispatchInput = SubagentRuntimeDispatchInput;
export type ExplorerRuntime = SubagentRuntime;
export type ExplorerRuntimeDispatchFunction = SubagentRuntimeDispatchFunction;

export function createSubprocessExplorerRuntime(): ExplorerRuntime {
	return createSubprocessSubagentRuntime();
}

export function createFunctionExplorerRuntime(
	dispatch: ExplorerRuntimeDispatchFunction,
): ExplorerRuntime {
	return createFunctionSubagentRuntime(dispatch);
}
