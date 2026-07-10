import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { SubagentFleetRegistry, type SubagentFleetTaskInput } from "./registry.ts";
import type { GitHeadSnapshot, ReadGitHead } from "./git-head.ts";
import type {
	RunnerSubagentResult,
	RunnerSubagentUpdate,
} from "../runner-subagents/extension-api.ts";
import { errorResult } from "../runner-subagents/results.ts";
import { syncSubagentFleetDisplay, type SubagentFleetDisplayContext } from "./display.ts";

export interface SubagentFleetRunTracking {
	markRunning(index: number): void;
	markProgress(index: number, update: RunnerSubagentUpdate): void;
	markDone(index: number, result: RunnerSubagentResult): void;
	dispose(): void;
}

export interface SingleSubagentFleetRunTracking {
	onStart(): void;
	onProgress(update: RunnerSubagentUpdate): void;
	onDone(result: RunnerSubagentResult): void;
	dispose(): void;
}

export function trackSingleSubagentFleetRun(input: {
	registry: SubagentFleetRegistry;
	ctx: SubagentFleetDisplayContext;
	title: string;
	prompt?: string;
	parentSessionFile: string | undefined;
	cwd?: string;
	readGitHead?: ReadGitHead;
}): SingleSubagentFleetRunTracking {
	const tracking = trackSubagentFleetRun({
		registry: input.registry,
		ctx: input.ctx,
		tasks: [
			{
				title: input.title,
				...optionalEntry("prompt", input.prompt),
			},
		],
		parentSessionFile: input.parentSessionFile,
		...optionalEntry("cwd", input.cwd),
		...optionalEntry("readGitHead", input.readGitHead),
	});
	return {
		onStart() {
			tracking.markRunning(0);
		},
		onProgress(update) {
			tracking.markProgress(0, update);
		},
		onDone(result) {
			tracking.markDone(0, result);
		},
		dispose() {
			tracking.dispose();
		},
	};
}

export function trackSubagentFleetRun(input: {
	registry: SubagentFleetRegistry;
	ctx: SubagentFleetDisplayContext;
	tasks: readonly SubagentFleetTaskInput[];
	parentSessionFile: string | undefined;
	cwd?: string;
	readGitHead?: ReadGitHead;
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
	readHead((head) => registry.markRunHeadBaseline(run.id, head));

	function requireTaskId(index: number): string {
		const taskId = run.tasks[index]?.id;
		if (taskId === undefined) {
			throw new Error(`Subagent fleet run ${run.id} has no task at index ${index}.`);
		}
		return taskId;
	}

	function readHead(apply: (head: GitHeadSnapshot) => void): void {
		if (input.readGitHead === undefined || input.cwd === undefined) return;
		void input.readGitHead({ cwd: input.cwd }).then(apply, (error: unknown) => {
			apply({ status: "unavailable", reason: formatErrorMessage(error) });
		});
	}

	return {
		markRunning(index) {
			const taskId = requireTaskId(index);
			registry.markRunning(taskId);
			readHead((head) => registry.markTaskHeadBaseline(taskId, head));
		},
		markProgress(index, update) {
			registry.markProgress(requireTaskId(index), update);
		},
		markDone(index, result) {
			const taskId = requireTaskId(index);
			doneIndexes.add(index);
			registry.markDone(taskId, result);
			readHead((head) => registry.markTaskFinalHead(taskId, head));
		},
		dispose() {
			if (isDisposed) return;
			isDisposed = true;
			for (const task of run.tasks) {
				if (doneIndexes.has(task.index)) continue;
				registry.markDone(
					task.id,
					placeholderFleetTaskResult({
						status: "error",
						diagnostic:
							"Subagent fleet tracking ended before this task produced a terminal result.",
						title: task.title,
					}),
				);
			}
			unsubscribe();
		},
	};
}

export interface PlaceholderFleetTaskResultOptions {
	status: "cancelled" | "error";
	diagnostic: string;
	title: string;
}

/** Terminal result for a task that never produced one itself. */
export function placeholderFleetTaskResult(
	options: PlaceholderFleetTaskResultOptions,
): RunnerSubagentResult {
	const progress = {
		title: options.title,
		state: "stopped",
		toolCount: 0,
		turnCount: 0,
		elapsedMs: 0,
	} as const;
	if (options.status === "error") {
		return errorResult(progress, options.diagnostic);
	}
	return {
		status: "cancelled",
		diagnostic: options.diagnostic,
		elapsedMs: 0,
		progress,
	};
}
