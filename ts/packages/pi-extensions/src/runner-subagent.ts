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

export interface RunnerSubagentTerminalToolDefinition<TInput = unknown> {
	name: string;
	status: RunnerSubagentTerminalStatus;
	description: string;
	parameters: TypeBoxLikeSchema;
}

export interface RunnerSubagentProgress {
	title?: string;
	state: "starting" | "running" | "terminating" | "stopped";
	currentTool?: string;
	toolCount: number;
	turnCount: number;
	elapsedMs: number;
	sessionFile?: string;
}

export type RunnerSubagentProgressCallback = (update: RunnerSubagentUpdate) => void;

export type RunnerSubagentOptions = {
	title?: string;
	prompt: string;
	model?: string;
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

export interface RunnerSubagentTerminalCapture<
	TInput = unknown,
	TStatus extends RunnerSubagentTerminalStatus = RunnerSubagentTerminalStatus,
> {
	toolName: string;
	toolCallId?: string;
	status: TStatus;
	input: TInput;
}

interface RunnerSubagentResultBase<TStatus extends RunnerSubagentStatus> {
	status: TStatus;
	title?: string;
	elapsedMs: number;
	progress: RunnerSubagentProgress;
	sessionFile?: string;
}

export interface RunnerSubagentCompletedResult<TInput = unknown> extends RunnerSubagentResultBase<"completed"> {
	terminal: RunnerSubagentTerminalCapture<TInput, "completed">;
}

export interface RunnerSubagentBlockedResult<TInput = unknown> extends RunnerSubagentResultBase<"blocked"> {
	terminal: RunnerSubagentTerminalCapture<TInput, "blocked">;
}

export interface RunnerSubagentFinalTextResult extends RunnerSubagentResultBase<"final-text"> {
	finalText: string;
	stopReason?: string;
}

interface RunnerSubagentFailureResultBase<TStatus extends RunnerSubagentFailureStatus> extends RunnerSubagentResultBase<TStatus> {
	diagnostic: string;
}

export interface RunnerSubagentStoppedWithoutTerminalResult extends RunnerSubagentFailureResultBase<"stopped-without-terminal"> {
	stopReason?: string;
}

export interface RunnerSubagentStoppedWithoutUsefulTextResult extends RunnerSubagentFailureResultBase<"stopped-without-useful-text"> {
	stopReason?: string;
}

export interface RunnerSubagentCancelledResult extends RunnerSubagentFailureResultBase<"cancelled"> {
	reason?: string;
}

export interface RunnerSubagentErrorResult extends RunnerSubagentFailureResultBase<"error"> {
	error: {
		message: string;
		name?: string;
		stack?: string;
	};
}

export interface RunnerSubagentProtocolErrorResult extends RunnerSubagentFailureResultBase<"protocol-error"> {
	protocolError: {
		message: string;
		event?: unknown;
	};
}

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

export interface RunnerSubagentPi {
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	[key: string]: unknown;
}

export interface RunnerSubagentContext {
	cwd: string;
	signal?: AbortSignal;
}

export async function dispatchRunnerSubagent<TTerminalInput = unknown>(
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: RunnerSubagentOptions,
): Promise<RunnerSubagentResult<TTerminalInput>> {
	return await dispatchRunnerSubagentProcess<TTerminalInput>(pi, ctx, options, pi[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]);
}
