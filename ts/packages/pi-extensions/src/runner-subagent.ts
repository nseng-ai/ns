import type { RunnerSubagentUpdate } from "./runner-subagent/activity.ts";
import { dispatchRunnerSubagentProcess, type RunnerSubagentDispatcherDependencies } from "./runner-subagent/subagent-process.ts";

export type { RunnerSubagentActivity, RunnerSubagentUpdate } from "./runner-subagent/activity.ts";

export type JsonObject = Record<string, unknown>;
export type TypeBoxLikeSchema = object;

export type RunnerSubagentReturnMode = "terminal" | "final-text";
export type RunnerSubagentTerminalStatus = "completed" | "blocked";
export type RunnerSubagentFinalTextStatus = "final-text";
export type RunnerSubagentFailureStatus =
	| "stopped-without-terminal"
	| "stopped-without-useful-text"
	| "cancelled"
	| "error"
	| "protocol-error";
export type RunnerSubagentStatus = RunnerSubagentTerminalStatus | RunnerSubagentFinalTextStatus | RunnerSubagentFailureStatus;

export type RunnerSubagentTerminalToolDefinition<TInput = unknown> = {
	name: string;
	status: RunnerSubagentTerminalStatus;
	description: string;
	parameters: TypeBoxLikeSchema;
};

export type RunnerSubagentProgress = {
	title?: string;
	state: "starting" | "running" | "terminating" | "stopped";
	currentTool?: string;
	toolCount: number;
	turnCount: number;
	elapsedMs: number;
	sessionFile?: string;
};

export type RunnerSubagentProgressCallback = (update: RunnerSubagentUpdate) => void;

export type RunnerSubagentOptions = {
	title?: string;
	prompt: string;
	cwd?: string;
	signal?: AbortSignal;
	onProgress?: RunnerSubagentProgressCallback;
} & (
	| {
			returnMode?: "terminal";
			terminalTools: readonly RunnerSubagentTerminalToolDefinition[];
	  }
	| {
			returnMode: "final-text";
			terminalTools?: readonly RunnerSubagentTerminalToolDefinition[];
	  }
);

export type RunnerSubagentTerminalCapture<
	TInput = unknown,
	TStatus extends RunnerSubagentTerminalStatus = RunnerSubagentTerminalStatus,
> = {
	toolName: string;
	toolCallId?: string;
	status: TStatus;
	input: TInput;
};

type RunnerSubagentResultBase<TStatus extends RunnerSubagentStatus> = {
	status: TStatus;
	title?: string;
	elapsedMs: number;
	progress: RunnerSubagentProgress;
	sessionFile?: string;
};

export type RunnerSubagentCompletedResult<TInput = unknown> = RunnerSubagentResultBase<"completed"> & {
	terminal: RunnerSubagentTerminalCapture<TInput, "completed">;
};

export type RunnerSubagentBlockedResult<TInput = unknown> = RunnerSubagentResultBase<"blocked"> & {
	terminal: RunnerSubagentTerminalCapture<TInput, "blocked">;
};

export type RunnerSubagentFinalTextResult = RunnerSubagentResultBase<"final-text"> & {
	finalText: string;
	stopReason?: string;
};

type RunnerSubagentFailureResultBase<TStatus extends RunnerSubagentFailureStatus> = RunnerSubagentResultBase<TStatus> & {
	diagnostic: string;
};

export type RunnerSubagentStoppedWithoutTerminalResult = RunnerSubagentFailureResultBase<"stopped-without-terminal"> & {
	stopReason?: string;
};

export type RunnerSubagentStoppedWithoutUsefulTextResult = RunnerSubagentFailureResultBase<"stopped-without-useful-text"> & {
	stopReason?: string;
};

export type RunnerSubagentCancelledResult = RunnerSubagentFailureResultBase<"cancelled"> & {
	reason?: string;
};

export type RunnerSubagentErrorResult = RunnerSubagentFailureResultBase<"error"> & {
	error: {
		message: string;
		name?: string;
		stack?: string;
	};
};

export type RunnerSubagentProtocolErrorResult = RunnerSubagentFailureResultBase<"protocol-error"> & {
	protocolError: {
		message: string;
		event?: unknown;
	};
};

export type RunnerSubagentResult<TInput = unknown> =
	| RunnerSubagentCompletedResult<TInput>
	| RunnerSubagentBlockedResult<TInput>
	| RunnerSubagentFinalTextResult
	| RunnerSubagentStoppedWithoutTerminalResult
	| RunnerSubagentStoppedWithoutUsefulTextResult
	| RunnerSubagentCancelledResult
	| RunnerSubagentErrorResult
	| RunnerSubagentProtocolErrorResult;

export const RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES = Symbol("dispatchRunnerSubagentDispatcherDependencies");

export type RunnerSubagentPi = {
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	[key: string]: unknown;
};

export type RunnerSubagentContext = {
	cwd: string;
	signal?: AbortSignal;
};

export async function dispatchRunnerSubagent<TTerminalInput = unknown>(
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: RunnerSubagentOptions,
): Promise<RunnerSubagentResult<TTerminalInput>> {
	return await dispatchRunnerSubagentProcess<TTerminalInput>(pi, ctx, options, pi[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]);
}
