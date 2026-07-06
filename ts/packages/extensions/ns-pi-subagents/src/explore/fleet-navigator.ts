import { readFile } from "node:fs/promises";

import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { registerCommandWithImmediateAck } from "@nseng-ai/pi/commands/ack";
import type {
	CommandContext,
	RenderComponent,
	TuiHandle,
} from "@nseng-ai/pi/runtime/extension-types";

import {
	createRunnerSubagentJsonEventParser,
	extractRunnerSubagentTimelineFromSessionJsonl,
	type RunnerSubagentFleetRegistry,
	type RunnerSubagentFleetTaskSnapshot,
	type RunnerSubagentJsonEventParserSnapshot,
	type RunnerSubagentTimeline,
	type RunnerSubagentTimelineEntry,
} from "@internal/pi-tools/runner-subagents";
import { EXPLORE_FLEET_COMMAND_NAME } from "./contract.ts";
import { formatExploreFleetWidgetLines, sortedFleetTasks, taskIcon } from "./fleet.ts";
import type { CommandRegistrar } from "./transcript-viewer.ts";

export { EXPLORE_FLEET_COMMAND_NAME } from "./contract.ts";

export interface ExploreFleetNavigatorDependencies {
	readTextFile?: (path: string) => Promise<string>;
}

export interface ExploreFleetTaskDetail {
	task: RunnerSubagentFleetTaskSnapshot;
	sessionFile?: string;
	modelText: string;
	turnCount: number;
	toolCount: number;
	state: string;
	status: string;
	timeline: RunnerSubagentTimeline;
	message?: string;
}

interface CommandRegistrarHost {
	registerCommand: CommandRegistrar;
}

export function registerExploreFleetCommand<TPi extends object>(input: {
	pi: TPi;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: ExploreFleetNavigatorDependencies;
}): void {
	if (!hasRegisterCommand(input.pi)) return;
	const host: CommandRegistrarHost = input.pi;
	registerCommandWithImmediateAck({
		host,
		commandName: EXPLORE_FLEET_COMMAND_NAME,
		commandDefinition: {
			description: "Open a read-only navigator for active explore child sessions.",
			async handler(_args: string, ctx: CommandContext) {
				await openExploreFleetNavigator({
					ctx,
					registry: input.registry,
					...(input.dependencies === undefined ? {} : { dependencies: input.dependencies }),
				});
			},
		},
	});
}

export async function openExploreFleetNavigator(input: {
	ctx: CommandContext;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: ExploreFleetNavigatorDependencies;
}): Promise<void> {
	const runs = input.registry.snapshot();
	const tasks = sortedFleetTasks(runs);
	if (tasks.length === 0) {
		input.ctx.ui.notify("No explore fleet tasks are known in this Pi session.", "info");
		return;
	}
	if (!input.ctx.hasUI || input.ctx.ui.custom === undefined) {
		input.ctx.ui.notify(formatExploreFleetWidgetLines(runs).join("\n"), "info");
		return;
	}

	const readTextFile =
		input.dependencies?.readTextFile ?? ((path: string) => readFile(path, "utf8"));
	await input.ctx.ui.custom<undefined>(
		(tui, _theme, _keybindings, done) =>
			new ExploreFleetNavigator({
				tui,
				registry: input.registry,
				readTextFile,
				done,
			}),
		{ overlay: true, overlayOptions: { title: "Explore fleet" } },
	);
}

export interface ExploreFleetNavigatorOptions {
	tui: Pick<TuiHandle, "requestRender">;
	registry: RunnerSubagentFleetRegistry;
	readTextFile: (path: string) => Promise<string>;
	done(value: undefined): void;
}

export class ExploreFleetNavigator implements RenderComponent {
	private readonly tui: Pick<TuiHandle, "requestRender">;
	private readonly registry: RunnerSubagentFleetRegistry;
	private readonly readTextFile: (path: string) => Promise<string>;
	private readonly done: (value: undefined) => void;
	private readonly unsubscribe: () => void;
	private mode: "list" | "detail" = "list";
	private tasks: RunnerSubagentFleetTaskSnapshot[];
	private selectedTaskId: string | undefined;
	private detail: ExploreFleetTaskDetail | undefined;
	private detailScrollFromBottom = 0;
	private isFollowing = true;
	private isReadInFlight = false;
	private hasQueuedRead = false;
	private isDisposed = false;

	constructor(options: ExploreFleetNavigatorOptions) {
		this.tui = options.tui;
		this.registry = options.registry;
		this.readTextFile = options.readTextFile;
		this.done = options.done;
		this.tasks = this.readTasks();
		this.selectedTaskId = this.tasks[0]?.id;
		this.unsubscribe = this.registry.subscribe(() => {
			this.refreshTasks();
			if (this.mode === "detail") this.scheduleDetailLoad();
			this.tui.requestRender();
		});
	}

	render(width: number): string[] {
		return this.mode === "detail" ? this.renderDetail(width) : this.renderList(width);
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (this.mode === "detail") {
			this.handleDetailInput(data);
			return;
		}
		this.handleListInput(data);
	}

	dispose(): void {
		if (this.isDisposed) return;
		this.isDisposed = true;
		this.unsubscribe();
	}

	private handleListInput(data: string): void {
		if (isCloseKey(data)) {
			this.close();
			return;
		}
		if (isDownKey(data)) {
			this.moveSelection(1);
			return;
		}
		if (isUpKey(data)) {
			this.moveSelection(-1);
			return;
		}
		if (data === "\r" || data === "o") this.openSelectedDetail();
	}

	private handleDetailInput(data: string): void {
		if (isCloseKey(data)) {
			this.close();
			return;
		}
		if (data === "b") {
			this.mode = "list";
			this.detail = undefined;
			this.tui.requestRender();
			return;
		}
		if (data === "r") {
			this.scheduleDetailLoad();
			return;
		}
		if (data === "f") {
			this.detailScrollFromBottom = 0;
			this.isFollowing = true;
			this.tui.requestRender();
			return;
		}
		if (isUpKey(data)) {
			this.detailScrollFromBottom += 1;
			this.isFollowing = false;
			this.tui.requestRender();
			return;
		}
		if (isDownKey(data)) {
			this.detailScrollFromBottom = Math.max(0, this.detailScrollFromBottom - 1);
			if (this.detailScrollFromBottom === 0) this.isFollowing = true;
			this.tui.requestRender();
		}
	}

	private moveSelection(delta: number): void {
		if (this.tasks.length === 0) return;
		const currentIndex = Math.max(
			0,
			this.tasks.findIndex((task) => task.id === this.selectedTaskId),
		);
		const nextIndex = Math.min(this.tasks.length - 1, Math.max(0, currentIndex + delta));
		this.selectedTaskId = this.tasks[nextIndex]?.id;
		this.tui.requestRender();
	}

	private openSelectedDetail(): void {
		if (this.selectedTask() === undefined) return;
		this.mode = "detail";
		this.detail = undefined;
		this.detailScrollFromBottom = 0;
		this.isFollowing = true;
		this.scheduleDetailLoad();
		this.tui.requestRender();
	}

	private scheduleDetailLoad(): void {
		if (this.isReadInFlight) {
			this.hasQueuedRead = true;
			return;
		}
		const task = this.selectedTask();
		if (task === undefined) return;
		this.isReadInFlight = true;
		void this.runDetailLoad(task);
	}

	private async runDetailLoad(task: RunnerSubagentFleetTaskSnapshot): Promise<void> {
		const detail = await loadFleetTaskDetail({
			task,
			readTextFile: this.readTextFile,
		});
		this.isReadInFlight = false;
		if (!this.isDisposed && this.mode === "detail" && this.selectedTaskId === task.id) {
			this.detail = detail;
			if (this.isFollowing) this.detailScrollFromBottom = 0;
			this.tui.requestRender();
		}
		if (!this.isDisposed && this.hasQueuedRead) {
			this.hasQueuedRead = false;
			this.scheduleDetailLoad();
		}
	}

	private refreshTasks(): void {
		this.tasks = this.readTasks();
		if (
			this.selectedTaskId !== undefined &&
			this.tasks.some((task) => task.id === this.selectedTaskId)
		) {
			return;
		}
		this.selectedTaskId = this.tasks[0]?.id;
	}

	private readTasks(): RunnerSubagentFleetTaskSnapshot[] {
		return sortedFleetTasks(this.registry.snapshot());
	}

	private selectedTask(): RunnerSubagentFleetTaskSnapshot | undefined {
		return this.tasks.find((task) => task.id === this.selectedTaskId);
	}

	private renderList(width: number): string[] {
		const counts = fleetCounts(this.tasks);
		const lines = [
			`explore fleet: ${counts.running} running · ${counts.queued} queued · ${counts.done} done`,
		];
		const selectedIndex = Math.max(
			0,
			this.tasks.findIndex((task) => task.id === this.selectedTaskId),
		);
		const window = windowRange(this.tasks.length, selectedIndex, 20);
		if (window.start > 0) lines.push(`… ${window.start} more`);
		for (const task of this.tasks.slice(window.start, window.end)) {
			const marker = task.id === this.selectedTaskId ? "▸" : " ";
			lines.push(
				truncatePlain(
					`${marker} ${taskIcon(task)} ${task.title} — ${task.finalStatus ?? task.state}`,
					width,
				),
			);
		}
		if (window.end < this.tasks.length) lines.push(`… ${this.tasks.length - window.end} more`);
		lines.push("", "↑/k ↓/j move · Enter/o open · q/Esc close");
		return lines;
	}

	private renderDetail(width: number): string[] {
		const task = this.selectedTask();
		if (task === undefined) return ["No selected explore task.", "", "b back · q/Esc close"];
		const detail = this.detail;
		const lines = [
			truncatePlain(task.title, width),
			detail === undefined
				? "loading…"
				: `${detail.state} — ${detail.status} — ${detail.modelText} — ${detail.turnCount} turns/${detail.toolCount} tools`,
			`session: ${task.sessionFile ?? "no session file yet"}`,
			"",
		];
		if (detail === undefined) {
			lines.push("Reading child session…");
		} else if (detail.message !== undefined) {
			lines.push(detail.message);
		} else {
			const entries = detail.timeline.entries;
			const visibleCount = 15;
			const end = Math.max(0, entries.length - this.detailScrollFromBottom);
			const start = Math.max(0, end - visibleCount);
			const earlier = detail.timeline.droppedEntryCount + start;
			if (earlier > 0) lines.push(`… ${earlier} earlier events`);
			for (const entry of entries.slice(start, end)) {
				lines.push(truncatePlain(renderTimelineEntry(entry), width));
			}
			if (this.detailScrollFromBottom > 0)
				lines.push(`… ${this.detailScrollFromBottom} later events`);
		}
		lines.push("", "j/k scroll · f follow · r reload · b back · q/Esc close");
		return lines;
	}

	private close(): void {
		this.dispose();
		this.done(undefined);
	}
}

export async function loadFleetTaskDetail(input: {
	task: RunnerSubagentFleetTaskSnapshot;
	readTextFile: (path: string) => Promise<string>;
}): Promise<ExploreFleetTaskDetail> {
	if (input.task.sessionFile === undefined)
		return placeholderDetail(input.task, "no session file yet");
	let jsonl: string;
	try {
		jsonl = await input.readTextFile(input.task.sessionFile);
	} catch (error) {
		return placeholderDetail(
			input.task,
			`Could not read session file: ${formatErrorMessage(error)}`,
		);
	}
	const parser = createRunnerSubagentJsonEventParser({
		title: input.task.title,
		sessionFile: input.task.sessionFile,
	});
	parser.pushChunk(jsonl);
	parser.finish();
	const snapshot = parser.getSnapshot();
	const timeline = extractRunnerSubagentTimelineFromSessionJsonl(jsonl);
	return detailFromSnapshot(input.task, input.task.sessionFile, snapshot, timeline);
}

function detailFromSnapshot(
	task: RunnerSubagentFleetTaskSnapshot,
	sessionFile: string,
	snapshot: RunnerSubagentJsonEventParserSnapshot,
	timeline: RunnerSubagentTimeline,
): ExploreFleetTaskDetail {
	return {
		task,
		sessionFile,
		modelText: modelText(snapshot),
		turnCount: snapshot.progress.turnCount,
		toolCount: snapshot.progress.toolCount,
		state: snapshot.progress.state,
		status: task.finalStatus ?? snapshot.stopReason ?? task.state,
		timeline,
	};
}

function placeholderDetail(
	task: RunnerSubagentFleetTaskSnapshot,
	message: string,
): ExploreFleetTaskDetail {
	return {
		task,
		...(task.sessionFile === undefined ? {} : { sessionFile: task.sessionFile }),
		modelText: "model unknown",
		turnCount: 0,
		toolCount: 0,
		state: task.state,
		status: task.finalStatus ?? task.state,
		timeline: { entries: [], droppedEntryCount: 0 },
		message,
	};
}

function fleetCounts(tasks: readonly RunnerSubagentFleetTaskSnapshot[]): {
	running: number;
	queued: number;
	done: number;
} {
	return {
		running: tasks.filter((task) => task.state === "running").length,
		queued: tasks.filter((task) => task.state === "queued").length,
		done: tasks.filter((task) => task.state === "done").length,
	};
}

function windowRange(
	length: number,
	selectedIndex: number,
	size: number,
): { start: number; end: number } {
	const safeSize = Math.max(1, size);
	const start = Math.max(0, Math.min(selectedIndex - Math.floor(safeSize / 2), length - safeSize));
	return { start, end: Math.min(length, start + safeSize) };
}

function renderTimelineEntry(entry: RunnerSubagentTimelineEntry): string {
	if (entry.kind === "assistant") return `● assistant: ${entry.text}`;
	const icon = entry.state === "running" ? "▶" : entry.state === "error" ? "✗" : "✓";
	const input = entry.inputPreview === undefined ? "" : `: ${entry.inputPreview}`;
	const result = entry.resultPreview === undefined ? "" : ` → ${entry.resultPreview}`;
	return `${icon} ${entry.toolName}${input}${result}`;
}

function modelText(snapshot: RunnerSubagentJsonEventParserSnapshot): string {
	const model = snapshot.progress.launch?.model;
	return model === undefined ? "model unknown" : `${model.provider}/${model.id}`;
}

function isUpKey(data: string): boolean {
	return data === "k" || data === "\u001b[A";
}

function isDownKey(data: string): boolean {
	return data === "j" || data === "\u001b[B";
}

function isCloseKey(data: string): boolean {
	return data === "q" || data === "\u001b";
}

function hasRegisterCommand(value: object): value is CommandRegistrarHost {
	return "registerCommand" in value && typeof value.registerCommand === "function";
}
