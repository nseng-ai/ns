import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { SubagentFleetRegistry, type SubagentFleetTaskInput } from "./registry.ts";
import type {
	RunnerSubagentResult,
	RunnerSubagentUpdate,
} from "../runner-subagents/extension-api.ts";
import { syncSubagentFleetDisplay, type SubagentFleetDisplayContext } from "./display.ts";

export interface SubagentFleetRunTracking {
	markRunning(index: number): void;
	markProgress(index: number, update: RunnerSubagentUpdate): void;
	markDone(index: number, result: RunnerSubagentResult): void;
	dispose(): void;
}

export function trackSubagentFleetRun(input: {
	registry: SubagentFleetRegistry;
	ctx: SubagentFleetDisplayContext;
	tasks: readonly SubagentFleetTaskInput[];
	parentSessionFile: string | undefined;
}): SubagentFleetRunTracking {
	const registry = input.registry;

	const run = registry.startRun(input.tasks, {
		...optionalEntry("parentSessionFile", input.parentSessionFile),
	});
	const unsubscribe = registry.subscribe(() => {
		syncSubagentFleetDisplay(input.ctx, registry.snapshot());
	});
	const doneIndexes = new Set<number>();
	let isDisposed = false;
	syncSubagentFleetDisplay(input.ctx, registry.snapshot());

	function requireTaskId(index: number): string {
		const taskId = run.tasks[index]?.id;
		if (taskId === undefined) {
			throw new Error(`Subagent fleet run ${run.id} has no task at index ${index}.`);
		}
		return taskId;
	}

	return {
		markRunning(index) {
			registry.markRunning(requireTaskId(index));
		},
		markProgress(index, update) {
			registry.markProgress(requireTaskId(index), update);
		},
		markDone(index, result) {
			doneIndexes.add(index);
			registry.markDone(requireTaskId(index), result);
		},
		dispose() {
			if (isDisposed) return;
			isDisposed = true;
			for (const task of run.tasks) {
				if (doneIndexes.has(task.index)) continue;
				registry.markDone(task.id, unfinishedFleetTaskResult(task));
			}
			unsubscribe();
		},
	};
}

function unfinishedFleetTaskResult(task: SubagentFleetTaskInput): RunnerSubagentResult {
	return {
		status: "error",
		diagnostic: "Subagent fleet tracking ended before this task produced a terminal result.",
		error: { message: "Subagent fleet tracking disposed before task completion." },
		elapsedMs: 0,
		progress: {
			state: "stopped",
			title: task.title,
			toolCount: 0,
			turnCount: 0,
			elapsedMs: 0,
		},
	};
}
