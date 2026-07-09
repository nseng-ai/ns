import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { resolveCliModel, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import { resolveRunnerSubagentLaunch } from "../runner-subagents/subagent-process.ts";
import type {
	RunnerSubagentActivity,
	RunnerSubagentProgress,
	RunnerSubagentResult,
} from "../runner-subagents/index.ts";
import type { SubagentRuntime, SubagentRuntimeDispatchInput } from "./seam.ts";

export type InProcessSubagentSessionEvent =
	| { type: "assistant"; text: string }
	| { type: "tool_start"; toolName: string }
	| { type: "tool_end"; toolName: string; preview?: string }
	| { type: "done"; finalText?: string; stopReason?: string };

export interface InProcessSubagentSession {
	sessionFile: string | undefined;
	subscribe(listener: (event: InProcessSubagentSessionEvent) => void): () => void;
	prompt(text: string, signal?: AbortSignal): Promise<void>;
	abort(): Promise<void> | void;
	dispose(): void;
}

export interface InProcessSubagentSessionFactory {
	create(input: InProcessSubagentSessionCreateInput): Promise<InProcessSubagentSession>;
}

export interface InProcessSubagentSessionCreateInput {
	cwd: string;
	tools: readonly string[];
	model?: Model<Api>;
	modelRegistry?: ModelRegistry;
	thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface InProcessSubagentRuntimeOptions {
	sessionFactory: InProcessSubagentSessionFactory;
	modelRegistry?: ModelRegistry;
}

export function createInProcessSubagentRuntime(
	options: InProcessSubagentRuntimeOptions,
): SubagentRuntime {
	return {
		dispatch(input) {
			return dispatchInProcessSubagent(input, options);
		},
	};
}

async function dispatchInProcessSubagent(
	input: SubagentRuntimeDispatchInput,
	options: InProcessSubagentRuntimeOptions,
): Promise<RunnerSubagentResult> {
	const sessionFactory = options.sessionFactory;
	const startedAt = Date.now();
	if (input.options.returnMode !== "final-text") {
		return unsupportedReturnModeResult(input, startedAt);
	}
	let session: InProcessSubagentSession | undefined;
	let finalText: string | undefined;
	let stopReason: string | undefined;
	let progress = initialProgress(input, startedAt, undefined);
	let activity: RunnerSubagentActivity = {};
	try {
		const launch =
			input.options.preResolvedLaunch ??
			resolveRunnerSubagentLaunch(input.pi, input.ctx, input.options);
		const model = resolveConcreteModel(launch, options.modelRegistry);
		if ("diagnostic" in model) throw new Error(model.diagnostic);
		session = await sessionFactory.create({
			cwd: input.options.cwd ?? input.ctx.cwd,
			tools: input.options.tools ?? [],
			thinkingLevel: model.thinkingLevel ?? launch?.thinkingLevel ?? "off",
			...(model.model === undefined ? {} : { model: model.model }),
			...(options.modelRegistry === undefined ? {} : { modelRegistry: options.modelRegistry }),
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
			const abort = (): void => {
				void session?.abort();
			};
			input.options.signal?.addEventListener("abort", abort, { once: true });
			try {
				await session.prompt(input.options.prompt, input.options.signal);
			} finally {
				input.options.signal?.removeEventListener("abort", abort);
			}
		} finally {
			unsubscribe();
		}
		progress = progressWithoutCurrentTool(progress, "stopped", startedAt);
		if (input.options.signal?.aborted) return cancelledResult(input, startedAt, progress);
		if (finalText === undefined || finalText.trim().length === 0) {
			return {
				status: "stopped-without-useful-text",
				diagnostic: "In-process subagent session stopped without final assistant text.",
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
			diagnostic: `In-process subagent dispatch failed: ${message}`,
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
	input: SubagentRuntimeDispatchInput,
	startedAt: number,
	sessionFile: string | undefined,
): RunnerSubagentProgress {
	const launch =
		input.options.preResolvedLaunch ??
		resolveRunnerSubagentLaunch(input.pi, input.ctx, input.options);
	return {
		...(input.options.title === undefined ? {} : { title: input.options.title }),
		state: "starting",
		toolCount: 0,
		turnCount: 0,
		elapsedMs: elapsedMs(startedAt),
		...(sessionFile === undefined ? {} : { sessionFile }),
		...(launch === undefined ? {} : { launch }),
	};
}

function mapInProcessEvent(
	event: InProcessSubagentSessionEvent,
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
	input: SubagentRuntimeDispatchInput,
	startedAt: number,
	progress: RunnerSubagentProgress,
): RunnerSubagentResult {
	const reason =
		typeof input.options.signal?.reason === "string" ? input.options.signal.reason : undefined;
	return {
		status: "cancelled",
		diagnostic: reason ?? "In-process subagent dispatch was cancelled.",
		elapsedMs: elapsedMs(startedAt),
		progress: progressWithoutCurrentTool(progress, "stopped", startedAt),
		...(reason === undefined ? {} : { reason }),
	};
}

function resolveConcreteModel(
	launch: SubagentRuntimeDispatchInput["options"]["preResolvedLaunch"],
	modelRegistry: ModelRegistry | undefined,
): { model?: Model<Api>; thinkingLevel?: ModelThinkingLevel } | { diagnostic: string } {
	if (launch === undefined) return {};
	if (modelRegistry === undefined) {
		return { diagnostic: "In-process execution requires ToolContext.modelRegistry." };
	}
	if (launch.requestedModel !== undefined) {
		const resolved = resolveCliModel({
			cliModel: launch.requestedModel,
			...(launch.model?.provider === undefined ? {} : { cliProvider: launch.model.provider }),
			modelRegistry,
		});
		if (resolved.model === undefined) {
			return {
				diagnostic:
					resolved.error ??
					`Model ${launch.requestedModel} is not registered for in-process execution.`,
			};
		}
		return {
			model: resolved.model,
			...(resolved.thinkingLevel === undefined ? {} : { thinkingLevel: resolved.thinkingLevel }),
		};
	}
	const provider = launch.model?.provider;
	const id = launch.model?.id;
	if (provider === undefined || id === undefined) return {};
	const model = modelRegistry.find(provider, id);
	if (model === undefined)
		return { diagnostic: `Model ${provider}/${id} is not registered for in-process execution.` };
	return { model };
}

function unsupportedReturnModeResult(
	input: SubagentRuntimeDispatchInput,
	startedAt: number,
): RunnerSubagentResult {
	const progress = initialProgress(input, startedAt, undefined);
	return {
		status: "error",
		diagnostic: "In-process subagent runtime supports final-text mode only.",
		error: { message: "Unsupported in-process return mode." },
		elapsedMs: elapsedMs(startedAt),
		progress: progressWithoutCurrentTool(progress, "stopped", startedAt),
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
