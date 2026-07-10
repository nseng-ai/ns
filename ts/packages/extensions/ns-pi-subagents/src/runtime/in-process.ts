import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { resolveCliModel, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Clock } from "@nseng-ai/foundation/clock";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";

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
	clock?: Clock;
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
	const clock = options.clock ?? systemClock;
	const startedAt = clock.nowMs();
	const elapsedMs = createElapsedMs(clock, startedAt);
	const launch =
		input.options.preResolvedLaunch ??
		resolveRunnerSubagentLaunch(input.pi, input.ctx, input.options);
	if (input.options.returnMode !== "final-text") {
		return unsupportedReturnModeResult({ input, launch, elapsedMs });
	}
	let session: InProcessSubagentSession | undefined;
	let finalText: string | undefined;
	let stopReason: string | undefined;
	let progress = initialProgress({ input, launch, elapsedMs, sessionFile: undefined });
	let activity: RunnerSubagentActivity = {};
	try {
		const model = resolveConcreteModel(launch, options.modelRegistry);
		if ("diagnostic" in model) throw new Error(model.diagnostic);
		session = await sessionFactory.create({
			cwd: input.options.cwd ?? input.ctx.cwd,
			tools: input.options.tools ?? [],
			thinkingLevel: model.thinkingLevel ?? launch?.thinkingLevel ?? "off",
			...(model.model === undefined ? {} : { model: model.model }),
			...(options.modelRegistry === undefined ? {} : { modelRegistry: options.modelRegistry }),
		});
		progress = initialProgress({ input, launch, elapsedMs, sessionFile: session.sessionFile });
		const unsubscribe = session.subscribe((event) => {
			const mapped = mapInProcessEvent({ event, progress, activity, elapsedMs });
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
				return cancelledResult(input, progress, elapsedMs);
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
		progress = progressWithoutCurrentTool(progress, "stopped", elapsedMs);
		if (input.options.signal?.aborted) return cancelledResult(input, progress, elapsedMs);
		if (finalText === undefined || finalText.trim().length === 0) {
			return {
				status: "stopped-without-useful-text",
				diagnostic: "In-process subagent session stopped without final assistant text.",
				elapsedMs: elapsedMs(),
				progress,
				...(session.sessionFile === undefined ? {} : { sessionFile: session.sessionFile }),
				...(stopReason === undefined ? {} : { stopReason }),
			};
		}
		return {
			status: "final-text",
			finalText,
			elapsedMs: elapsedMs(),
			progress,
			...(session.sessionFile === undefined ? {} : { sessionFile: session.sessionFile }),
			...(stopReason === undefined ? {} : { stopReason }),
		};
	} catch (error) {
		if (input.options.signal?.aborted) {
			return cancelledResult(input, progress, elapsedMs);
		}
		const message = formatErrorMessage(error);
		return {
			status: "error",
			diagnostic: `In-process subagent dispatch failed: ${message}`,
			error: { message },
			elapsedMs: elapsedMs(),
			progress: progressWithoutCurrentTool(progress, "stopped", elapsedMs),
			...(session?.sessionFile === undefined ? {} : { sessionFile: session.sessionFile }),
		};
	} finally {
		session?.dispose();
	}
}

interface InitialProgressOptions {
	input: SubagentRuntimeDispatchInput;
	launch: SubagentRuntimeDispatchInput["options"]["preResolvedLaunch"];
	elapsedMs: () => number;
	sessionFile: string | undefined;
}

function initialProgress(options: InitialProgressOptions): RunnerSubagentProgress {
	return {
		...(options.input.options.title === undefined ? {} : { title: options.input.options.title }),
		state: "starting",
		toolCount: 0,
		turnCount: 0,
		elapsedMs: options.elapsedMs(),
		...(options.sessionFile === undefined ? {} : { sessionFile: options.sessionFile }),
		...(options.launch === undefined ? {} : { launch: options.launch }),
	};
}

interface MapInProcessEventOptions {
	event: InProcessSubagentSessionEvent;
	progress: RunnerSubagentProgress;
	activity: RunnerSubagentActivity;
	elapsedMs: () => number;
}

function mapInProcessEvent(options: MapInProcessEventOptions): {
	progress: RunnerSubagentProgress;
	activity: RunnerSubagentActivity;
} {
	const { event, progress, activity, elapsedMs } = options;
	switch (event.type) {
		case "assistant":
			return {
				progress: {
					...progress,
					state: "running",
					turnCount: progress.turnCount + 1,
					elapsedMs: elapsedMs(),
				},
				activity: { ...activity, assistantPreview: event.text },
			};
		case "tool_start":
			return {
				progress: {
					...progress,
					state: "running",
					currentTool: event.toolName,
					elapsedMs: elapsedMs(),
				},
				activity,
			};
		case "tool_end":
			return {
				progress: {
					...progressWithoutCurrentTool(progress, "running", elapsedMs),
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
				progress: progressWithoutCurrentTool(progress, "stopped", elapsedMs),
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
	progress: RunnerSubagentProgress,
	elapsedMs: () => number,
): RunnerSubagentResult {
	const reason =
		typeof input.options.signal?.reason === "string" ? input.options.signal.reason : undefined;
	return {
		status: "cancelled",
		diagnostic: reason ?? "In-process subagent dispatch was cancelled.",
		elapsedMs: elapsedMs(),
		progress: progressWithoutCurrentTool(progress, "stopped", elapsedMs),
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

interface UnsupportedReturnModeResultOptions {
	input: SubagentRuntimeDispatchInput;
	launch: SubagentRuntimeDispatchInput["options"]["preResolvedLaunch"];
	elapsedMs: () => number;
}

function unsupportedReturnModeResult(
	options: UnsupportedReturnModeResultOptions,
): RunnerSubagentResult {
	const { input, launch, elapsedMs } = options;
	const progress = initialProgress({ input, launch, elapsedMs, sessionFile: undefined });
	return {
		status: "error",
		diagnostic: "In-process subagent runtime supports final-text mode only.",
		error: { message: "Unsupported in-process return mode." },
		elapsedMs: elapsedMs(),
		progress: progressWithoutCurrentTool(progress, "stopped", elapsedMs),
	};
}

function progressWithoutCurrentTool(
	progress: RunnerSubagentProgress,
	state: RunnerSubagentProgress["state"],
	elapsedMs: () => number,
): RunnerSubagentProgress {
	return {
		...(progress.title === undefined ? {} : { title: progress.title }),
		state,
		toolCount: progress.toolCount,
		turnCount: progress.turnCount,
		elapsedMs: elapsedMs(),
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		...(progress.launch === undefined ? {} : { launch: progress.launch }),
	};
}

function createElapsedMs(clock: Clock, startedAt: number): () => number {
	return () => Math.max(0, clock.nowMs() - startedAt);
}
