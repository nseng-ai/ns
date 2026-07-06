import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type {
	RunnerSubagentActivity,
	RunnerSubagentProgress,
	RunnerSubagentResult,
} from "../runner-subagents/index.ts";
import type { ExplorerRuntime, ExplorerRuntimeDispatchInput } from "./runtime.ts";

export type InProcessExplorerSessionEvent =
	| { type: "assistant"; text: string }
	| { type: "tool_start"; toolName: string }
	| { type: "tool_end"; toolName: string; preview?: string }
	| { type: "done"; finalText?: string; stopReason?: string };

export interface InProcessExplorerSession {
	sessionFile?: string;
	subscribe(listener: (event: InProcessExplorerSessionEvent) => void): () => void;
	prompt(text: string, signal?: AbortSignal): Promise<void>;
	abort(): Promise<void> | void;
	dispose(): void;
}

export interface InProcessExplorerSessionFactory {
	create(input: InProcessExplorerSessionCreateInput): Promise<InProcessExplorerSession>;
}

export interface InProcessExplorerSessionCreateInput {
	cwd: string;
	tools: readonly string[];
	model?: string;
}

export interface InProcessExplorerRuntimeOptions {
	sessionFactory: InProcessExplorerSessionFactory;
}

export function createInProcessExplorerRuntime(
	options: InProcessExplorerRuntimeOptions,
): ExplorerRuntime {
	return {
		dispatch(input) {
			return dispatchInProcessExplorer(input, options.sessionFactory);
		},
	};
}

async function dispatchInProcessExplorer(
	input: ExplorerRuntimeDispatchInput,
	sessionFactory: InProcessExplorerSessionFactory,
): Promise<RunnerSubagentResult> {
	const startedAt = Date.now();
	let session: InProcessExplorerSession | undefined;
	let finalText: string | undefined;
	let stopReason: string | undefined;
	let progress = initialProgress(input, startedAt, undefined);
	let activity: RunnerSubagentActivity = {};
	try {
		session = await sessionFactory.create({
			cwd: input.options.cwd ?? input.ctx.cwd,
			tools: input.options.tools ?? [],
			...(input.options.model === undefined ? {} : { model: input.options.model }),
		});
		progress = initialProgress(input, startedAt, session.sessionFile);
		const unsubscribe = session.subscribe((event) => {
			const mapped = mapInProcessEvent(event, progress, activity, startedAt);
			progress = mapped.progress;
			activity = mapped.activity;
			if (event.type === "done") {
				finalText = event.finalText;
				stopReason = event.stopReason;
			}
			input.options.onProgress?.({ progress, activity });
		});
		try {
			if (input.options.signal?.aborted) {
				await session.abort();
				return cancelledResult(input, startedAt, progress);
			}
			const abort = async (): Promise<void> => {
				await session?.abort();
			};
			input.options.signal?.addEventListener("abort", () => void abort(), { once: true });
			await session.prompt(input.options.prompt, input.options.signal);
		} finally {
			unsubscribe();
		}
		progress = progressWithoutCurrentTool(progress, "stopped", startedAt);
		if (input.options.signal?.aborted) return cancelledResult(input, startedAt, progress);
		if (finalText === undefined || finalText.trim().length === 0) {
			return {
				status: "stopped-without-useful-text",
				diagnostic: "In-process explorer session stopped without final assistant text.",
				elapsedMs: elapsedMs(startedAt),
				progress,
				...(session.sessionFile === undefined ? {} : { sessionFile: session.sessionFile }),
				...(stopReason === undefined ? {} : { stopReason }),
			};
		}
		return {
			status: "final-text",
			finalText,
			elapsedMs: elapsedMs(startedAt),
			progress,
			...(session.sessionFile === undefined ? {} : { sessionFile: session.sessionFile }),
			...(stopReason === undefined ? {} : { stopReason }),
		};
	} catch (error) {
		if (input.options.signal?.aborted) return cancelledResult(input, startedAt, progress);
		const message = formatErrorMessage(error);
		return {
			status: "error",
			diagnostic: `In-process explorer dispatch failed: ${message}`,
			error: { message },
			elapsedMs: elapsedMs(startedAt),
			progress: progressWithoutCurrentTool(progress, "stopped", startedAt),
			...(session?.sessionFile === undefined ? {} : { sessionFile: session.sessionFile }),
		};
	} finally {
		session?.dispose();
	}
}

function initialProgress(
	input: ExplorerRuntimeDispatchInput,
	startedAt: number,
	sessionFile: string | undefined,
): RunnerSubagentProgress {
	return {
		...(input.options.title === undefined ? {} : { title: input.options.title }),
		state: "starting",
		toolCount: 0,
		turnCount: 0,
		elapsedMs: elapsedMs(startedAt),
		...(sessionFile === undefined ? {} : { sessionFile }),
	};
}

function mapInProcessEvent(
	event: InProcessExplorerSessionEvent,
	progress: RunnerSubagentProgress,
	activity: RunnerSubagentActivity,
	startedAt: number,
): { progress: RunnerSubagentProgress; activity: RunnerSubagentActivity } {
	switch (event.type) {
		case "assistant":
			return {
				progress: {
					...progress,
					state: "running",
					turnCount: progress.turnCount + 1,
					elapsedMs: elapsedMs(startedAt),
				},
				activity: { ...activity, assistantPreview: event.text },
			};
		case "tool_start":
			return {
				progress: {
					...progress,
					state: "running",
					currentTool: event.toolName,
					elapsedMs: elapsedMs(startedAt),
				},
				activity,
			};
		case "tool_end":
			return {
				progress: {
					...progressWithoutCurrentTool(progress, "running", startedAt),
					toolCount: progress.toolCount + 1,
				},
				activity: {
					...activity,
					lastToolName: event.toolName,
					...(event.preview === undefined ? {} : { lastToolResultPreview: event.preview }),
					lastToolResultIsError: false,
				},
			};
		case "done":
			return {
				progress: progressWithoutCurrentTool(progress, "stopped", startedAt),
				activity:
					event.finalText === undefined
						? activity
						: { ...activity, assistantPreview: event.finalText },
			};
		default: {
			const exhaustive: never = event;
			return exhaustive;
		}
	}
}

function cancelledResult(
	input: ExplorerRuntimeDispatchInput,
	startedAt: number,
	progress: RunnerSubagentProgress,
): RunnerSubagentResult {
	const reason =
		typeof input.options.signal?.reason === "string" ? input.options.signal.reason : undefined;
	return {
		status: "cancelled",
		diagnostic: reason ?? "In-process explorer dispatch was cancelled.",
		elapsedMs: elapsedMs(startedAt),
		progress: progressWithoutCurrentTool(progress, "stopped", startedAt),
		...(reason === undefined ? {} : { reason }),
	};
}

function progressWithoutCurrentTool(
	progress: RunnerSubagentProgress,
	state: RunnerSubagentProgress["state"],
	startedAt: number,
): RunnerSubagentProgress {
	return {
		...(progress.title === undefined ? {} : { title: progress.title }),
		state,
		toolCount: progress.toolCount,
		turnCount: progress.turnCount,
		elapsedMs: elapsedMs(startedAt),
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		...(progress.launch === undefined ? {} : { launch: progress.launch }),
	};
}

function elapsedMs(startedAt: number): number {
	return Math.max(0, Date.now() - startedAt);
}
