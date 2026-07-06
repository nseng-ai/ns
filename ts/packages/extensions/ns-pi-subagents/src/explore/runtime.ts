import {
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "../runner-subagents/index.ts";

export interface ExplorerRuntimeDispatchInput {
	pi: RunnerSubagentPi;
	ctx: RunnerSubagentContext;
	options: RunnerSubagentOptions;
}

export interface ExplorerRuntime {
	dispatch(input: ExplorerRuntimeDispatchInput): Promise<RunnerSubagentResult>;
}

export type ExplorerRuntimeDispatchFunction = (
	input: ExplorerRuntimeDispatchInput,
) => Promise<RunnerSubagentResult>;

export function createSubprocessExplorerRuntime(): ExplorerRuntime {
	return {
		dispatch(input) {
			return dispatchRunnerSubagent(input.pi, input.ctx, input.options);
		},
	};
}

export function createFunctionExplorerRuntime(
	dispatch: ExplorerRuntimeDispatchFunction,
): ExplorerRuntime {
	return { dispatch };
}
