import {
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "../runner-subagents/index.ts";

export interface SubagentRuntimeDispatchInput {
	readonly pi: RunnerSubagentPi;
	readonly ctx: RunnerSubagentContext;
	readonly options: RunnerSubagentOptions;
}

export interface SubagentRuntime {
	dispatch(input: SubagentRuntimeDispatchInput): Promise<RunnerSubagentResult>;
}

export type SubagentRuntimeDispatchFunction = (
	input: SubagentRuntimeDispatchInput,
) => Promise<RunnerSubagentResult>;

export function createSubprocessSubagentRuntime(): SubagentRuntime {
	return {
		async dispatch(input) {
			return await dispatchRunnerSubagent(input.pi, input.ctx, input.options);
		},
	};
}

export function createFunctionSubagentRuntime(
	dispatch: SubagentRuntimeDispatchFunction,
): SubagentRuntime {
	return { dispatch };
}
