import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import { resolveCliModel, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Clock } from "@nseng-ai/foundation/clock";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";

import { errorResult } from "../runner-subagents/results.ts";
import {
	abortReason,
	effectiveAbortSignal,
	hasAbortedSignal,
	uniqueAbortSignals,
} from "../runner-subagents/abort-signals.ts";
import { resolveRunnerSubagentLaunch } from "../runner-subagents/subagent-process.ts";
import type {
	RunnerSubagentActivity,
	RunnerSubagentProgress,
	RunnerSubagentResult,
} from "../runner-subagents/index.ts";
import type { SubagentOutcome, SubagentRuntime, SubagentRuntimeDispatchInput } from "./seam.ts";

export type InProcessSubagentSessionEvent =
	| { type: "assistant"; text: string }
	| { type: "tool_start"; toolName: string }
	| { type: "tool_end"; toolName: string; preview?: string }
	| { type: "done"; finalText?: string; stopReason?: string };

export interface InProcessSubagentSession {
	sessionFile: string | undefined;
	subscribe(listener: (event: InProcessSubagentSessionEvent) => void): () => void;
	prompt(text: string): Promise<void>;
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
	thinkingLevel: ModelThinkingLevel;
}

export interface InProcessSubagentRuntimeOptions {
	sessionFactory: InProcessSubagentSessionFactory;
	modelRegistry: ModelRegistry;
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
	const abortSignals = uniqueAbortSignals(input.ctx.signal, input.options.signal);
	const signal = effectiveAbortSignal(abortSignals);
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
	const initialCancellation = cancelledIfAborted({
		abortSignals,
		progress,
		elapsedMs,
		session,
	});
	if (initialCancellation !== undefined) return initialCancellation;
	try {
		const model = resolveConcreteModel(launch, options.modelRegistry);
		if (!model.ok) {
			return errorResult(
				progressWithoutCurrentTool(progress, "stopped", elapsedMs),
				`In-process subagent dispatch failed: ${model.diagnostic}`,
				new Error(model.diagnostic),
			);
		}
		session = await sessionFactory.create({
			cwd: input.options.cwd ?? input.ctx.cwd,
			tools: input.options.tools ?? [],
			thinkingLevel: model.thinkingLevel ?? launch?.thinkingLevel ?? "off",
			...optionalEntry("model", model.model),
			modelRegistry: options.modelRegistry,
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
			const prePromptCancellation = cancelledIfAborted({
				abortSignals,
				progress,
				elapsedMs,
				session,
			});
			if (prePromptCancellation !== undefined) {
				await session.abort();
				return prePromptCancellation;
			}
			let hasAbortedSession = false;
			const abort = (): void => {
				if (hasAbortedSession) return;
				hasAbortedSession = true;
				void session?.abort();
			};
			signal?.addEventListener("abort", abort, { once: true });
			try {
				await session.prompt(input.options.prompt);
			} finally {
				signal?.removeEventListener("abort", abort);
			}
		} finally {
			unsubscribe();
		}
		progress = progressWithoutCurrentTool(progress, "stopped", elapsedMs);
		const postPromptCancellation = cancelledIfAborted({
			abortSignals,
			progress,
			elapsedMs,
			session,
		});
		if (postPromptCancellation !== undefined) return postPromptCancellation;
		if (finalText === undefined || finalText.trim().length === 0) {
			return {
				status: "stopped-without-useful-text",
				diagnostic: "In-process subagent session stopped without final assistant text.",
				elapsedMs: elapsedMs(),
				progress,
				...optionalEntry("sessionFile", session.sessionFile),
				...optionalEntry("stopReason", stopReason),
			};
		}
		return {
			status: "final-text",
			finalText,
			elapsedMs: elapsedMs(),
			progress,
			...optionalEntry("sessionFile", session.sessionFile),
			...optionalEntry("stopReason", stopReason),
		};
	} catch (error) {
		const caughtCancellation = cancelledIfAborted({
			abortSignals,
			progress,
			elapsedMs,
			session,
		});
		if (caughtCancellation !== undefined) return caughtCancellation;
		const message = formatErrorMessage(error);
		const stopped = progressWithoutCurrentTool(progress, "stopped", elapsedMs);
		return errorResult(
			{
				...stopped,
				...optionalEntry("sessionFile", session?.sessionFile),
			},
			`In-process subagent dispatch failed: ${message}`,
			error,
		);
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
		...optionalEntry("title", options.input.options.title),
		state: "starting",
		toolCount: 0,
		turnCount: 0,
		elapsedMs: options.elapsedMs(),
		...optionalEntry("sessionFile", options.sessionFile),
		...optionalEntry("launch", options.launch),
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
					...optionalEntry("lastToolResultPreview", event.preview),
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

interface CancelledIfAbortedOptions {
	abortSignals: readonly AbortSignal[];
	progress: RunnerSubagentProgress;
	elapsedMs: () => number;
	session: InProcessSubagentSession | undefined;
}

function cancelledIfAborted(options: CancelledIfAbortedOptions): RunnerSubagentResult | undefined {
	if (!hasAbortedSignal(...options.abortSignals)) return undefined;
	const reason = abortReason(options.abortSignals);
	return {
		status: "cancelled",
		diagnostic: reason ?? "In-process subagent dispatch was cancelled.",
		elapsedMs: options.elapsedMs(),
		progress: progressWithoutCurrentTool(options.progress, "stopped", options.elapsedMs),
		...optionalEntry("reason", reason),
		...optionalEntry("sessionFile", options.session?.sessionFile),
	};
}

function resolveConcreteModel(
	launch: SubagentRuntimeDispatchInput["options"]["preResolvedLaunch"],
	modelRegistry: ModelRegistry,
): SubagentOutcome<{ model?: Model<Api>; thinkingLevel?: ModelThinkingLevel }> {
	if (launch === undefined) return { ok: true };
	if (launch.requestedModelSelection !== undefined) {
		const requested = launch.requestedModelSelection;
		const resolved = resolveCliModel({
			cliModel: requested.modelId,
			cliProvider: requested.provider,
			modelRegistry,
		});
		if (resolved.model === undefined) {
			return {
				ok: false,
				diagnostic:
					resolved.error ??
					`Model ${requested.provider}/${requested.modelId} is not registered for in-process execution.`,
			};
		}
		return {
			ok: true,
			model: resolved.model,
			...optionalEntry("thinkingLevel", resolved.thinkingLevel),
		};
	}
	const provider = launch.modelSelection?.provider;
	const id = launch.modelSelection?.modelId;
	if (provider === undefined || id === undefined) return { ok: true };
	const model = modelRegistry.find(provider, id);
	if (model === undefined) {
		return {
			ok: false,
			diagnostic: `Model ${provider}/${id} is not registered for in-process execution.`,
		};
	}
	return { ok: true, model };
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
		...optionalEntry("title", progress.title),
		state,
		toolCount: progress.toolCount,
		turnCount: progress.turnCount,
		elapsedMs: elapsedMs(),
		...optionalEntry("sessionFile", progress.sessionFile),
		...optionalEntry("launch", progress.launch),
	};
}

function createElapsedMs(clock: Clock, startedAt: number): () => number {
	return () => Math.max(0, clock.nowMs() - startedAt);
}
