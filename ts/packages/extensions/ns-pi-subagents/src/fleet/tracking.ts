import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import { errorResult } from "../explore/result.ts";
import { SubagentFleetRegistry, type SubagentFleetTaskInput } from "./registry.ts";
import { getOrCreateSubagentFleetRegistry } from "./provider.ts";
import type { GitHeadSnapshot, ReadGitHead } from "./git-head.ts";
import type {
	RunnerSubagentPi,
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

export interface SingleSubagentFleetRunTracking {
	markRunning(): void;
	markProgress(update: RunnerSubagentUpdate): void;
	markDone(result: RunnerSubagentResult): void;
	dispose(): void;
}

export interface SingleSubagentFleetRunContext extends SubagentFleetDisplayContext {
	readonly sessionManager?: { getSessionFile?(): string | undefined };
}

type SingleSubagentFleetRunSource =
	| { readonly pi: RunnerSubagentPi; readonly registry?: never }
	| { readonly registry: SubagentFleetRegistry; readonly pi?: never };

export type TrackSingleSubagentFleetRunInput = SingleSubagentFleetRunSource & {
	readonly ctx: SingleSubagentFleetRunContext;
	readonly title: string;
	readonly prompt: string;
	readonly parentSessionFile?: string;
	readonly cwd?: string;
	readonly readGitHead?: ReadGitHead;
};

export function trackSingleSubagentFleetRun(
	input: TrackSingleSubagentFleetRunInput,
): SingleSubagentFleetRunTracking {
	const registry = input.registry ?? getOrCreateSubagentFleetRegistry(input.pi);
	const tracking = trackSubagentFleetRun({
		registry,
		ctx: input.ctx,
		tasks: [{ title: input.title, prompt: input.prompt }],
		parentSessionFile: input.parentSessionFile ?? input.ctx.sessionManager?.getSessionFile?.(),
		...optionalEntry("cwd", input.cwd),
		...optionalEntry("readGitHead", input.readGitHead),
	});

	return {
		markRunning() {
			tracking.markRunning(0);
		},
		markProgress(update) {
			tracking.markProgress(0, update);
		},
		markDone(result) {
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
				registry.markDone(task.id, unfinishedFleetTaskResult(task));
			}
			unsubscribe();
		},
	};
}

function unfinishedFleetTaskResult(task: SubagentFleetTaskInput): RunnerSubagentResult {
	return errorResult(
		task.title,
		"Subagent fleet tracking ended before this task produced a terminal result.",
	);
}
