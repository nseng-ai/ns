import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import type { ReadGitHead } from "../fleet/git-head.ts";
import type { SubagentFleetRegistry } from "../fleet/registry.ts";
import { trackSubagentFleetRun } from "../fleet/tracking.ts";
import type { SubagentRuntime } from "../runtime/seam.ts";
import {
	mapWithConcurrency,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
	type RunnerSubagentUpdate,
} from "../runner-subagents/index.ts";

export interface ToolkitDispatchDependencies {
	pi: RunnerSubagentPi;
	runtime: SubagentRuntime;
	fleetRegistry: SubagentFleetRegistry;
	readGitHead?: ReadGitHead;
}

export const SUBAGENT_TASK_NOT_STARTED = Symbol("subagent-task-not-started");
export type ToolkitDispatchBatchResult<TResult> = TResult | typeof SUBAGENT_TASK_NOT_STARTED;

export interface ToolkitDispatchTrackingResult {
	result: RunnerSubagentResult;
}

export interface ToolkitDispatchBatchInput<TItem, TResult> {
	ctx: ToolContext;
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
