import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ToolContext, ToolResult } from "@nseng-ai/pi/runtime/tool-types";

import type { ReadGitHead } from "../fleet/git-head.ts";
import type { SubagentFleetRegistry } from "../fleet/registry.ts";
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
	resultForTracking(result: TResult): RunnerSubagentResult;
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
		...(args.trackingPrompt === undefined ? {} : { prompt: args.trackingPrompt }),
		parentSessionFile: args.ctx.sessionManager?.getSessionFile?.(),
		cwd,
		...optionalEntry("readGitHead", deps.readGitHead),
	});
	const runnerCtx = toRunnerSubagentContext(args.ctx, signal);
	const options = {
		...args.options,
		cwd,
		...(signal === undefined ? {} : { signal }),
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
): Promise<readonly TResult[]> {
	const tracking = trackSubagentFleetRun({
		registry: deps.fleetRegistry,
		ctx: args.ctx,
		tasks: args.tasks.map((item, index) => {
			const prompt = args.taskPrompt?.(item, index);
			return {
				title: args.taskTitle(item, index),
				...(prompt === undefined ? {} : { prompt }),
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
			...(args.signal === undefined ? {} : { signal: args.signal }),
			run: async (item, index) => {
				tracking.markRunning(index);
				const result = await args.run(item, index, (update) =>
					tracking.markProgress(index, update),
				);
				tracking.markDone(index, args.resultForTracking(result));
				return result;
			},
		});
		return results.filter((result) => result !== undefined);
	} finally {
		tracking.dispose();
	}
}

export function toRunnerSubagentContext(
	ctx: Pick<ToolContext, "cwd" | "model">,
	signal?: AbortSignal,
): RunnerSubagentContext {
	return {
		cwd: ctx.cwd,
		...(signal === undefined ? {} : { signal }),
		...(ctx.model === undefined ? {} : { model: ctx.model }),
	};
}
