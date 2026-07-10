import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import type { ReadGitHead } from "../fleet/git-head.ts";
import type { SubagentFleetRegistry } from "../fleet/registry.ts";
import { placeholderFleetTaskResult, trackSubagentFleetRun } from "../fleet/tracking.ts";
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

export interface ToolkitDispatchTask {
	readonly title: string;
	readonly prompt: string;
}

export interface ToolkitDispatchBatchInput {
	ctx: ToolContext;
	tasks: readonly ToolkitDispatchTask[];
	maxConcurrency: number;
	signal?: AbortSignal;
	run(
		task: ToolkitDispatchTask,
		index: number,
		onProgress: (update: RunnerSubagentUpdate) => void,
	): Promise<RunnerSubagentResult>;
}

export async function dispatchSubagentBatch(
	deps: ToolkitDispatchDependencies,
	args: ToolkitDispatchBatchInput,
): Promise<readonly RunnerSubagentResult[]> {
	const tracking = trackSubagentFleetRun({
		registry: deps.fleetRegistry,
		ctx: args.ctx,
		tasks: args.tasks,
		parentSessionFile: args.ctx.sessionManager?.getSessionFile?.(),
		cwd: args.ctx.cwd,
		...optionalEntry("readGitHead", deps.readGitHead),
	});
	try {
		const results = await mapWithConcurrency({
			items: args.tasks,
			maxConcurrency: args.maxConcurrency,
			...optionalEntry("signal", args.signal),
			run: async (task, index) => {
				tracking.markRunning(index);
				// A thrown run() must become an error result instead of rejecting the
				// batch: Promise.all rejection would orphan in-flight siblings while
				// tracking.dispose() marks their slots, letting the detached workers
				// overwrite terminal fleet state later.
				let result: RunnerSubagentResult;
				try {
					result = await args.run(task, index, (update) => tracking.markProgress(index, update));
				} catch (error) {
					result = placeholderFleetTaskResult("error", formatErrorMessage(error), task.title);
				}
				tracking.markDone(index, result);
				return result;
			},
		});
		return results.map((result, index) => {
			if (result !== undefined) return result;
			const task = args.tasks[index];
			if (task === undefined) {
				throw new Error(`Subagent batch has no task at result index ${index}.`);
			}
			const notStarted = placeholderFleetTaskResult(
				"cancelled",
				"Task was not started.",
				task.title,
			);
			tracking.markDone(index, notStarted);
			return notStarted;
		});
	} finally {
		tracking.dispose();
	}
}
