import { runChildSessionProcess, type ChildSessionRunnerDependencies } from "./run-child-session/child-process.ts";

export type JsonObject = Record<string, unknown>;
export type TypeBoxLikeSchema = object;

export type ChildSessionReturnMode = "terminal" | "final-text";
export type ChildSessionTerminalStatus = "completed" | "blocked";
export type ChildSessionFinalTextStatus = "final-text";
export type ChildSessionFailureStatus =
	| "stopped-without-terminal"
	| "stopped-without-useful-text"
	| "cancelled"
	| "error"
	| "protocol-error";
export type ChildSessionStatus = ChildSessionTerminalStatus | ChildSessionFinalTextStatus | ChildSessionFailureStatus;

export type ChildSessionTerminalToolDefinition<TInput = unknown> = {
	name: string;
	status: ChildSessionTerminalStatus;
	description: string;
	parameters: TypeBoxLikeSchema;
};

export type ChildSessionOptions = {
	title?: string;
	prompt: string;
	cwd?: string;
	signal?: AbortSignal;
} & (
	| {
			returnMode?: "terminal";
			terminalTools: readonly ChildSessionTerminalToolDefinition[];
	  }
	| {
			returnMode: "final-text";
			terminalTools?: readonly ChildSessionTerminalToolDefinition[];
	  }
);

export type ChildSessionProgress = {
	title?: string;
	state: "starting" | "running" | "terminating" | "stopped";
	currentTool?: string;
	toolCount: number;
	turnCount: number;
	elapsedMs: number;
	sessionFile?: string;
};

export type ChildSessionTerminalCapture<
	TInput = unknown,
	TStatus extends ChildSessionTerminalStatus = ChildSessionTerminalStatus,
> = {
	toolName: string;
	toolCallId?: string;
	status: TStatus;
	input: TInput;
};

type ChildSessionResultBase<TStatus extends ChildSessionStatus> = {
	status: TStatus;
	title?: string;
	elapsedMs: number;
	progress: ChildSessionProgress;
	sessionFile?: string;
};

export type ChildSessionCompletedResult<TInput = unknown> = ChildSessionResultBase<"completed"> & {
	terminal: ChildSessionTerminalCapture<TInput, "completed">;
};

export type ChildSessionBlockedResult<TInput = unknown> = ChildSessionResultBase<"blocked"> & {
	terminal: ChildSessionTerminalCapture<TInput, "blocked">;
};

export type ChildSessionFinalTextResult = ChildSessionResultBase<"final-text"> & {
	finalText: string;
	stopReason?: string;
};

type ChildSessionFailureResultBase<TStatus extends ChildSessionFailureStatus> = ChildSessionResultBase<TStatus> & {
	diagnostic: string;
};

export type ChildSessionStoppedWithoutTerminalResult = ChildSessionFailureResultBase<"stopped-without-terminal"> & {
	stopReason?: string;
};

export type ChildSessionStoppedWithoutUsefulTextResult = ChildSessionFailureResultBase<"stopped-without-useful-text"> & {
	stopReason?: string;
};

export type ChildSessionCancelledResult = ChildSessionFailureResultBase<"cancelled"> & {
	reason?: string;
};

export type ChildSessionErrorResult = ChildSessionFailureResultBase<"error"> & {
	error: {
		message: string;
		name?: string;
		stack?: string;
	};
};

export type ChildSessionProtocolErrorResult = ChildSessionFailureResultBase<"protocol-error"> & {
	protocolError: {
		message: string;
		event?: unknown;
	};
};

export type ChildSessionResult<TInput = unknown> =
	| ChildSessionCompletedResult<TInput>
	| ChildSessionBlockedResult<TInput>
	| ChildSessionFinalTextResult
	| ChildSessionStoppedWithoutTerminalResult
	| ChildSessionStoppedWithoutUsefulTextResult
	| ChildSessionCancelledResult
	| ChildSessionErrorResult
	| ChildSessionProtocolErrorResult;

export const CHILD_SESSION_RUNNER_DEPENDENCIES = Symbol("runChildSessionRunnerDependencies");

export type ChildSessionPi = {
	[CHILD_SESSION_RUNNER_DEPENDENCIES]?: ChildSessionRunnerDependencies;
	[key: string]: unknown;
};

export type ChildSessionContext = {
	cwd: string;
	signal?: AbortSignal;
};

export async function runChildSession<TTerminalInput = unknown>(
	pi: ChildSessionPi,
	ctx: ChildSessionContext,
	options: ChildSessionOptions,
): Promise<ChildSessionResult<TTerminalInput>> {
	return await runChildSessionProcess<TTerminalInput>(pi, ctx, options, pi[CHILD_SESSION_RUNNER_DEPENDENCIES]);
}
