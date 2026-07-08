import type {
	RunnerSubagentResult,
	RunnerSubagentUpdate,
} from "../runner-subagents/extension-api.ts";
import { runnerSubagentPrimaryActivityPreview } from "../runner-subagents/activity.ts";
import type { GitHeadSnapshot } from "./git-head.ts";

export const SUBAGENT_FLEET_RECENT_TASK_CAP = 20;

export type SubagentFleetTaskState = "queued" | "running" | "done";

export interface SubagentFleetTaskInput {
	title: string;
	prompt?: string;
}

export interface SubagentFleetTaskSnapshot {
	id: string;
	runId: string;
	index: number;
	title: string;
	prompt?: string;
	state: SubagentFleetTaskState;
	latestActivity?: string;
	finalStatus?: RunnerSubagentResult["status"];
	sessionFile?: string;
	headBaseline?: GitHeadSnapshot;
	finalHead?: GitHeadSnapshot;
}

export interface SubagentFleetRunSnapshot {
	id: string;
	parentSessionFile?: string;
	headBaseline?: GitHeadSnapshot;
	tasks: readonly SubagentFleetTaskSnapshot[];
}

export interface SubagentFleetStartRunOptions {
	parentSessionFile?: string;
	headBaseline?: GitHeadSnapshot;
}

interface MutableSubagentFleetTask {
	id: string;
	runId: string;
	index: number;
	title: string;
	prompt?: string;
	state: SubagentFleetTaskState;
	latestActivity?: string;
	finalStatus?: RunnerSubagentResult["status"];
	sessionFile?: string;
	headBaseline?: GitHeadSnapshot;
	finalHead?: GitHeadSnapshot;
	sequence: number;
}

interface MutableSubagentFleetRun {
	id: string;
	parentSessionFile?: string;
	headBaseline?: GitHeadSnapshot;
	tasks: MutableSubagentFleetTask[];
}

export class SubagentFleetRegistry {
	private readonly recentTaskCap: number;
	private nextRunNumber = 1;
	private sequence = 1;
	private readonly runs: MutableSubagentFleetRun[] = [];
	private readonly listeners = new Set<() => void>();

	constructor(options: { recentTaskCap?: number } = {}) {
		this.recentTaskCap = options.recentTaskCap ?? SUBAGENT_FLEET_RECENT_TASK_CAP;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	startRun(
		tasks: readonly SubagentFleetTaskInput[],
		options: SubagentFleetStartRunOptions = {},
	): SubagentFleetRunSnapshot {
		const run: MutableSubagentFleetRun = {
			id: `subagents-${this.nextRunNumber}`,
			...(options.parentSessionFile === undefined
				? {}
				: { parentSessionFile: options.parentSessionFile }),
			...(options.headBaseline === undefined ? {} : { headBaseline: options.headBaseline }),
			tasks: tasks.map((task, index) => ({
				id: `subagents-${this.nextRunNumber}-${index + 1}`,
				runId: `subagents-${this.nextRunNumber}`,
				index,
				title: task.title,
				...(task.prompt === undefined ? {} : { prompt: task.prompt }),
				state: "queued",
				sequence: this.sequence++,
			})),
		};
		this.nextRunNumber += 1;
		this.runs.push(run);
		this.evictCompletedOverflow();
		this.emit();
		return snapshotRun(run);
	}

	markRunning(taskId: string): void {
		this.updateTask(taskId, (task) => {
			task.state = "running";
			task.sequence = this.sequence++;
		});
	}

	markProgress(taskId: string, update: RunnerSubagentUpdate): void {
		this.updateTask(taskId, (task) => {
			const activity = activityDescription(update);
			if (activity !== undefined) task.latestActivity = activity;
			if (update.progress.sessionFile !== undefined) task.sessionFile = update.progress.sessionFile;
			task.sequence = this.sequence++;
		});
	}

	markRunHeadBaseline(runId: string, head: GitHeadSnapshot): void {
		const run = this.findRun(runId);
		if (run === undefined) return;
		run.headBaseline = head;
		this.emit();
	}

	markTaskHeadBaseline(taskId: string, head: GitHeadSnapshot): void {
		this.updateTask(taskId, (task) => {
			task.headBaseline = head;
			task.sequence = this.sequence++;
		});
	}

	markTaskFinalHead(taskId: string, head: GitHeadSnapshot): void {
		this.updateTask(taskId, (task) => {
			task.finalHead = head;
			task.sequence = this.sequence++;
		});
	}

	markDone(taskId: string, result: RunnerSubagentResult): void {
		this.updateTask(taskId, (task) => {
			task.state = "done";
			task.finalStatus = result.status;
			if (result.sessionFile !== undefined) task.sessionFile = result.sessionFile;
			task.sequence = this.sequence++;
		});
		this.evictCompletedOverflow();
	}

	clear(): void {
		this.runs.splice(0, this.runs.length);
		this.emit();
	}

	snapshot(): readonly SubagentFleetRunSnapshot[] {
		return this.runs.map(snapshotRun);
	}

	tasksWithSessionFiles(): SubagentFleetTaskSnapshot[] {
		return this.snapshot()
			.flatMap((run) => run.tasks)
			.filter((task) => task.sessionFile !== undefined)
			.sort(compareFleetTasksForDisplay);
	}

	private updateTask(taskId: string, update: (task: MutableSubagentFleetTask) => void): void {
		const task = this.findTask(taskId);
		if (task === undefined) return;
		update(task);
		this.emit();
	}

	private findTask(taskId: string): MutableSubagentFleetTask | undefined {
		for (const run of this.runs) {
			const task = run.tasks.find((candidate) => candidate.id === taskId);
			if (task !== undefined) return task;
		}
		return undefined;
	}

	private findRun(runId: string): MutableSubagentFleetRun | undefined {
		return this.runs.find((run) => run.id === runId);
	}

	private evictCompletedOverflow(): void {
		const completed = this.runs
			.flatMap((run) => run.tasks)
			.filter((task) => task.state === "done")
			.sort((left, right) => left.sequence - right.sequence);
		const removeCount = Math.max(0, completed.length - this.recentTaskCap);
		const removeIds = new Set(completed.slice(0, removeCount).map((task) => task.id));
		if (removeIds.size === 0) return;
		for (const run of this.runs) {
			run.tasks = run.tasks.filter((task) => !removeIds.has(task.id));
		}
		for (let index = this.runs.length - 1; index >= 0; index -= 1) {
			if (this.runs[index]?.tasks.length === 0) this.runs.splice(index, 1);
		}
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

export function compareFleetTasksForDisplay(
	left: SubagentFleetTaskSnapshot,
	right: SubagentFleetTaskSnapshot,
): number {
	return taskSortRank(left) - taskSortRank(right);
}

function taskSortRank(task: SubagentFleetTaskSnapshot): number {
	const stateRank = task.state === "running" ? 0 : task.state === "queued" ? 1 : 2;
	return stateRank * 10_000 + task.index;
}

function snapshotRun(run: MutableSubagentFleetRun): SubagentFleetRunSnapshot {
	return {
		id: run.id,
		...(run.parentSessionFile === undefined ? {} : { parentSessionFile: run.parentSessionFile }),
		...(run.headBaseline === undefined ? {} : { headBaseline: run.headBaseline }),
		tasks: run.tasks.map((task) => snapshotTask(task, run.headBaseline)),
	};
}

function snapshotTask(
	task: MutableSubagentFleetTask,
	runHeadBaseline: GitHeadSnapshot | undefined,
): SubagentFleetTaskSnapshot {
	const headBaseline = task.headBaseline ?? runHeadBaseline;
	return {
		id: task.id,
		runId: task.runId,
		index: task.index,
		title: task.title,
		...(task.prompt === undefined ? {} : { prompt: task.prompt }),
		state: task.state,
		...(task.latestActivity === undefined ? {} : { latestActivity: task.latestActivity }),
		...(task.finalStatus === undefined ? {} : { finalStatus: task.finalStatus }),
		...(task.sessionFile === undefined ? {} : { sessionFile: task.sessionFile }),
		...(headBaseline === undefined ? {} : { headBaseline }),
		...(task.finalHead === undefined ? {} : { finalHead: task.finalHead }),
	};
}

function activityDescription(update: RunnerSubagentUpdate): string | undefined {
	const preview = runnerSubagentPrimaryActivityPreview(update.activity);
	if (preview !== undefined) return preview;
	if (update.progress.currentTool !== undefined) return update.progress.currentTool;
	if (update.progress.turnCount > 0) return `turn ${update.progress.turnCount}`;
	return undefined;
}
