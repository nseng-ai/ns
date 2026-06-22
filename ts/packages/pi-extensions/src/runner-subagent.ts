import type { ModelInfo, ThinkingLevel } from "./cmux/types.ts";
import type { RunnerSubagentUpdate } from "./runner-subagent/activity.ts";
import {
	dispatchRunnerSubagentProcess,
	type RunnerSubagentDispatcherDependencies,
} from "./runner-subagent/subagent-process.ts";

export {
	runnerSubagentPrimaryActivityPreview,
	type RunnerSubagentActivity,
	type RunnerSubagentUpdate,
} from "./runner-subagent/activity.ts";

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
export type RunnerSubagentStatus =
	| RunnerSubagentTerminalStatus
	| RunnerSubagentFinalTextStatus
	| RunnerSubagentFailureStatus;

export interface RunnerSubagentTerminalToolDefinition<TInput = unknown> {
	name: string;
	status: RunnerSubagentTerminalStatus;
	description: string;
	parameters: TypeBoxLikeSchema;
	/**
	 * Phantom marker recording the tool's parsed-input type for callers that pass a type argument
	 * (e.g. `RunnerSubagentTerminalToolDefinition<CompletionInput>`). Never populated at runtime;
	 * it exists only so the type parameter participates structurally without constraining `parameters`,
	 * which must stay assignable from arbitrary schema objects.
	 */
	readonly __input?: TInput;
}

export interface RunnerSubagentLaunchMetadata {
	model?: ModelInfo;
	requestedModel?: string;
	thinkingLevel: ThinkingLevel;
	observedThinkingLevel?: ThinkingLevel;
	hasModelArg: boolean;
	hasThinkingArg: boolean;
}

export interface RunnerSubagentLaunchOptions {
	model?: ModelInfo;
	thinkingLevel?: ThinkingLevel;
}

export function defaultRunnerSubagentLaunchMetadata(): RunnerSubagentLaunchMetadata {
	return {
		thinkingLevel: "off",
		hasModelArg: false,
		hasThinkingArg: false,
	};
}

type RunnerSubagentLaunchInput =
	| {
			launch?: RunnerSubagentLaunchOptions;
			preResolvedLaunch?: never;
	  }
	| {
			launch?: never;
			preResolvedLaunch: RunnerSubagentLaunchMetadata;
	  };

export interface RunnerSubagentUsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
}

export type RunnerSubagentUsageUnavailableReason =
	| "missing-session-file"
	| "session-read-error"
	| "malformed-session-jsonl"
	| "no-assistant-usage";

export type RunnerSubagentUsageMetadata =
	| {
			status: "available";
			source: "child-session-file";
			sessionFile: string;
			assistantMessageCount: number;
			totals: RunnerSubagentUsageTotals;
			contextWindow?: number;
	  }
	| {
			status: "unavailable";
			source: "child-session-file";
			sessionFile?: string;
			reason: RunnerSubagentUsageUnavailableReason;
			diagnostic: string;
	  };

export interface RunnerSubagentProgress {
	title?: string;
	state: "starting" | "running" | "terminating" | "stopped";
	currentTool?: string;
	toolCount: number;
	turnCount: number;
	elapsedMs: number;
	sessionFile?: string;
	launch?: RunnerSubagentLaunchMetadata;
}

export type RunnerSubagentProgressCallback = (update: RunnerSubagentUpdate) => void;

export type RunnerSubagentOptions = {
	title?: string;
	prompt: string;
	model?: string | undefined;
	cwd?: string;
	signal?: AbortSignal;
	tools?: readonly string[];
	onProgress?: RunnerSubagentProgressCallback;
} & RunnerSubagentLaunchInput &
	(
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
	usage?: RunnerSubagentUsageMetadata;
}

export interface RunnerSubagentCompletedResult<
	TInput = unknown,
> extends RunnerSubagentResultBase<"completed"> {
	terminal: RunnerSubagentTerminalCapture<TInput, "completed">;
}

export interface RunnerSubagentBlockedResult<
	TInput = unknown,
> extends RunnerSubagentResultBase<"blocked"> {
	terminal: RunnerSubagentTerminalCapture<TInput, "blocked">;
}

export interface RunnerSubagentFinalTextResult extends RunnerSubagentResultBase<"final-text"> {
	finalText: string;
	stopReason?: string;
}

interface RunnerSubagentFailureResultBase<
	TStatus extends RunnerSubagentFailureStatus,
> extends RunnerSubagentResultBase<TStatus> {
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

export function resultDiagnostic(result: RunnerSubagentResult): string | undefined {
	switch (result.status) {
		case "completed":
			return "Subagent Pi completed with a terminal capture instead of final assistant text.";
		case "blocked":
			return "Subagent Pi blocked with a terminal capture instead of final assistant text.";
		case "final-text":
			return undefined;
		case "stopped-without-terminal":
		case "stopped-without-useful-text":
		case "cancelled":
		case "error":
		case "protocol-error":
			return result.diagnostic;
		default: {
			const exhaustive: never = result;
			return exhaustive;
		}
	}
}

export const RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES = Symbol(
	"dispatchRunnerSubagentDispatcherDependencies",
);

export interface RunnerSubagentPi {
	[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES]?: RunnerSubagentDispatcherDependencies;
	getThinkingLevel?: () => ThinkingLevel;
}

export interface RunnerSubagentContext {
	cwd: string;
	signal?: AbortSignal;
	model?: ModelInfo;
}

export async function dispatchRunnerSubagent<TTerminalInput = unknown>(
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: RunnerSubagentOptions,
): Promise<RunnerSubagentResult<TTerminalInput>> {
	return await dispatchRunnerSubagentProcess<TTerminalInput>(
		pi,
		ctx,
		options,
		pi[RUNNER_SUBAGENT_DISPATCHER_DEPENDENCIES],
	);
}
