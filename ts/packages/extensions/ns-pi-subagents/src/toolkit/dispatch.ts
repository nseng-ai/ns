import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ToolContext, ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import type { ReadGitHead } from "../fleet/git-head.ts";
import type { SubagentFleetRegistry, SubagentFleetRetryEvidence } from "../fleet/registry.ts";
import { trackSingleSubagentFleetRun, trackSubagentFleetRun } from "../fleet/tracking.ts";
import type { SubagentRuntime } from "../runtime/seam.ts";
import {
	defaultRunnerSubagentLaunchMetadata,
	mapWithConcurrency,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "../runner-subagents/index.ts";
import { withRunnerSubagentWidget } from "../runner-subagents/widget.ts";

export type SubagentToolContext = ToolContext & {
	signal?: AbortSignal;
	onUpdate?: (update: Partial<ToolResult>) => void;
};

export interface ToolkitDispatchDependencies {
	pi: RunnerSubagentPi;
	runtime: SubagentRuntime;
	fleetRegistry: SubagentFleetRegistry;
	readGitHead?: ReadGitHead;
}

export interface ToolkitDispatchInput {
	ctx: SubagentToolContext;
	title: string;
	options: RunnerSubagentOptions;
	widgetKey?: string;
	trackingPrompt?: string;
	onProgress?: (update: RunnerSubagentUpdate) => void;
}

export const SUBAGENT_TASK_NOT_STARTED = Symbol("subagent-task-not-started");
export type ToolkitDispatchBatchResult<TResult> = TResult | typeof SUBAGENT_TASK_NOT_STARTED;

export interface ToolkitDispatchTrackingResult {
	result: RunnerSubagentResult;
	retry?: SubagentFleetRetryEvidence;
}

export interface ToolkitDispatchBatchInput<TItem, TResult> {
	ctx: SubagentToolContext;
	tasks: readonly TItem[];
	taskTitle(item: TItem, index: number): string;
	taskPrompt?: (item: TItem, index: number) => string | undefined;
	maxConcurrency: number;
	signal?: AbortSignal;
	run(
		item: TItem,
		index: number,
		onProgress: (update: RunnerSubagentUpdate) => void,
	): Promise<TResult>;
	resultForTracking(result: TResult): ToolkitDispatchTrackingResult;
}

export async function dispatchSubagent<T = unknown>(
	deps: ToolkitDispatchDependencies,
	args: ToolkitDispatchInput,
): Promise<RunnerSubagentResult<T>> {
	const cwd = args.ctx.cwd;
	const signal = args.ctx.signal;
	const tracking = trackSingleSubagentFleetRun({
		registry: deps.fleetRegistry,
		ctx: args.ctx,
		title: args.title,
		...optionalEntry("prompt", args.trackingPrompt),
		parentSessionFile: args.ctx.sessionManager?.getSessionFile?.(),
		cwd,
		...optionalEntry("readGitHead", deps.readGitHead),
	});
	const runnerCtx = toRunnerSubagentContext(args.ctx, signal);
	const options = {
		...args.options,
		cwd,
		...optionalEntry("signal", signal),
		onProgress: (update: RunnerSubagentUpdate) => {
			tracking.onProgress(update);
			args.onProgress?.(update);
		},
	} satisfies RunnerSubagentOptions;

	try {
		tracking.onStart();
		const run = async (onWidgetProgress?: (update: RunnerSubagentUpdate) => void) =>
			(await deps.runtime.dispatch({
				pi: deps.pi,
				ctx: runnerCtx,
				options: {
					...options,
					onProgress: (update) => {
						options.onProgress?.(update);
						onWidgetProgress?.(update);
					},
				},
			})) as RunnerSubagentResult<T>;
		const result =
			args.widgetKey === undefined
				? await run()
				: await withRunnerSubagentWidget({
						ctx: args.ctx,
						key: args.widgetKey,
						initial: {
							title: args.title,
							launch: defaultRunnerSubagentLaunchMetadata(),
						},
						run,
					});
		tracking.onDone(result);
		return result;
	} finally {
		tracking.dispose();
	}
}

export async function dispatchSubagentBatch<TItem, TResult>(
	deps: ToolkitDispatchDependencies,
	args: ToolkitDispatchBatchInput<TItem, TResult>,
): Promise<readonly ToolkitDispatchBatchResult<TResult>[]> {
	const tracking = trackSubagentFleetRun({
		registry: deps.fleetRegistry,
		ctx: args.ctx,
		tasks: args.tasks.map((item, index) => {
			const prompt = args.taskPrompt?.(item, index);
			return {
				title: args.taskTitle(item, index),
				...optionalEntry("prompt", prompt),
			};
		}),
		parentSessionFile: args.ctx.sessionManager?.getSessionFile?.(),
		cwd: args.ctx.cwd,
		...optionalEntry("readGitHead", deps.readGitHead),
	});
	try {
		const results = await mapWithConcurrency({
			items: args.tasks,
			maxConcurrency: args.maxConcurrency,
			...optionalEntry("signal", args.signal),
			run: async (item, index) => {
				tracking.markRunning(index);
				const result = await args.run(item, index, (update) =>
					tracking.markProgress(index, update),
				);
				const trackingResult = args.resultForTracking(result);
				if (trackingResult.retry !== undefined) {
					tracking.markRetry(index, trackingResult.retry);
				}
				tracking.markDone(index, trackingResult.result);
				return result;
			},
		});
		return results.map((result, index) => {
			if (result !== undefined) return result;
			const item = args.tasks[index];
			if (item === undefined) {
				throw new Error(`Subagent batch has no task at result index ${index}.`);
			}
			tracking.markDone(index, notStartedFleetTaskResult(args.taskTitle(item, index)));
			return SUBAGENT_TASK_NOT_STARTED;
		});
	} finally {
		tracking.dispose();
	}
}

function notStartedFleetTaskResult(title: string): RunnerSubagentResult {
	const diagnostic = "Task was not started.";
	return {
		status: "cancelled",
		diagnostic,
		elapsedMs: 0,
		progress: { title, state: "stopped", toolCount: 0, turnCount: 0, elapsedMs: 0 },
	};
}

export function toRunnerSubagentContext(
	ctx: Pick<ToolContext, "cwd" | "model">,
	signal?: AbortSignal,
): RunnerSubagentContext {
	return {
		cwd: ctx.cwd,
		...optionalEntry("signal", signal),
		...optionalEntry("model", ctx.model),
	};
}
