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
	overlayHostOptions,
	overlayRenderLayout,
	renderOverlayFrame,
	sliceWrappedDetailLinesForViewport,
} from "@internal/pi-tools/overlay-kit";
import {
	createRunnerSubagentJsonEventParser,
	extractRunnerSubagentTimelineFromSessionJsonl,
	formatElapsed,
	readRunnerSubagentUsageFromSessionFile,
	type RunnerSubagentFleetRegistry,
	type RunnerSubagentFleetRunSnapshot,
	type RunnerSubagentFleetTaskSnapshot,
	type RunnerSubagentJsonEventParserSnapshot,
	type RunnerSubagentTimeline,
	type RunnerSubagentTimelineEntry,
	type RunnerSubagentUsageMetadata,
} from "@internal/pi-tools/runner-subagents";
import { EXPLORE_FLEET_COMMAND_NAME, EXPLORE_FLEET_SHORTCUTS } from "./contract.ts";
import { formatExploreFleetTaskLines, sortedFleetTasks, taskIcon } from "./fleet.ts";
import type { CommandRegistrar } from "./transcript-viewer.ts";

export { EXPLORE_FLEET_COMMAND_NAME, EXPLORE_FLEET_SHORTCUTS } from "./contract.ts";

export const EXPLORE_FLEET_PARENT_ENTRY_ID = "parent-session";
const PARENT_ENTRY_TITLE = "Parent Pi session";

const LIST_FOOTER = "↑/k ↓/j move · Enter/o open · q/Esc close";
const DETAIL_FOOTER = "j/k scroll · f follow · p prompt · r reload · b back · q/Esc close";

export interface ExploreFleetNavigatorDependencies {
	readTextFile?: (path: string) => Promise<string>;
}

export interface ExploreFleetTaskDetail {
	task: RunnerSubagentFleetTaskSnapshot;
	sessionFile?: string;
	modelText: string;
	turnCount: number;
	toolCount: number;
	elapsedMs: number;
	state: string;
	status: string;
	timeline: RunnerSubagentTimeline;
	usage?: RunnerSubagentUsageMetadata;
	message?: string;
}

/**
 * The slice of the command/shortcut context the navigator needs. Structurally
 * satisfied both by `CommandContext` and by the host's shortcut-handler context.
 */
export interface ExploreFleetNavigatorContext {
	hasUI: boolean;
	sessionManager?: { getSessionFile?(): string | undefined };
	ui: Pick<CommandContext["ui"], "notify" | "custom">;
}

export type RegisterShortcutFunction = (
	shortcut: string,
	options: {
		description?: string;
		handler: (ctx: ExploreFleetNavigatorContext) => Promise<void> | void;
	},
) => void;

interface CommandRegistrarHost {
	registerCommand: CommandRegistrar;
}

interface ShortcutRegistrarHost {
	registerShortcut: RegisterShortcutFunction;
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
			description: "Open a read-only navigator for explore child sessions.",
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

export function registerExploreFleetShortcut<TPi extends object>(input: {
	pi: TPi;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: ExploreFleetNavigatorDependencies;
}): void {
	if (!hasRegisterShortcut(input.pi)) return;
	for (const shortcut of EXPLORE_FLEET_SHORTCUTS) {
		input.pi.registerShortcut(shortcut, {
			description: "Open the explore fleet navigator.",
			async handler(ctx: ExploreFleetNavigatorContext) {
				await openExploreFleetNavigator({
					ctx,
					registry: input.registry,
					...(input.dependencies === undefined ? {} : { dependencies: input.dependencies }),
				});
			},
		});
	}
}

export async function openExploreFleetNavigator(input: {
	ctx: ExploreFleetNavigatorContext;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: ExploreFleetNavigatorDependencies;
}): Promise<void> {
	const parentSessionFile = input.ctx.sessionManager?.getSessionFile?.();
	if (!input.ctx.hasUI || input.ctx.ui.custom === undefined) {
		const lines = formatExploreFleetTaskLines(input.registry.snapshot());
		if (lines.length === 0 && parentSessionFile !== undefined) {
			lines.push("explore fleet: no subagent runs yet", `◉ parent session — ${parentSessionFile}`);
		}
		input.ctx.ui.notify(
			lines.length === 0
				? "No explore fleet tasks are known in this Pi session."
				: lines.join("\n"),
			"info",
		);
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
				...(parentSessionFile === undefined ? {} : { parentSessionFile }),
			}),
		overlayHostOptions(),
	);
}

export interface ExploreFleetNavigatorOptions {
	tui: Pick<TuiHandle, "requestRender">;
	registry: RunnerSubagentFleetRegistry;
	readTextFile: (path: string) => Promise<string>;
	done(value: undefined): void;
	/** Parent Pi session file resolved at open time; keeps the parent entry present before any run. */
	parentSessionFile?: string;
}

export class ExploreFleetNavigator implements RenderComponent {
	private readonly tui: Pick<TuiHandle, "requestRender">;
	private readonly registry: RunnerSubagentFleetRegistry;
	private readonly readTextFile: (path: string) => Promise<string>;
	private readonly done: (value: undefined) => void;
	private readonly fallbackParentSessionFile: string | undefined;
	private readonly unsubscribe: () => void;
	private mode: "list" | "detail" = "list";
	private tasks: RunnerSubagentFleetTaskSnapshot[];
	private selectedTaskId: string | undefined;
	private detail: ExploreFleetTaskDetail | undefined;
	private detailScroll = 0;
	private detailMaxScroll = 0;
	private isFollowing = true;
	private isPromptExpanded = false;
	private isReadInFlight = false;
	private hasQueuedRead = false;
	private isDisposed = false;

	constructor(options: ExploreFleetNavigatorOptions) {
		this.tui = options.tui;
		this.registry = options.registry;
		this.readTextFile = options.readTextFile;
		this.done = options.done;
		this.fallbackParentSessionFile = options.parentSessionFile;
		this.tasks = this.readTasks();
		this.selectedTaskId = defaultSelectionId(this.tasks);
		this.unsubscribe = this.registry.subscribe(() => {
			this.refreshTasks();
			if (this.mode === "detail") this.scheduleDetailLoad();
			this.tui.requestRender();
		});
	}

	render(width: number): string[] {
		const header = this.mode === "detail" ? this.detailHeader() : this.listHeader();
		const { innerWidth, bodyRows } = overlayRenderLayout({
			width,
			terminalRows: readTerminalRows(this.tui),
			headerLength: header.length,
		});
		const body =
			this.mode === "detail"
				? this.detailBody(innerWidth, bodyRows)
				: this.listBody(innerWidth, bodyRows);
		return renderOverlayFrame({
			header: header.map((line) => truncatePlain(line, innerWidth)),
			body: padRows(body, bodyRows),
			footer: this.mode === "detail" ? DETAIL_FOOTER : LIST_FOOTER,
			width,
			colorizeBorder: (text) => text,
		});
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
		if (data === "p") {
			this.isPromptExpanded = !this.isPromptExpanded;
			this.tui.requestRender();
			return;
		}
		if (data === "f") {
			this.isFollowing = true;
			this.tui.requestRender();
			return;
		}
		if (isUpKey(data)) {
			this.detailScroll = Math.max(0, Math.min(this.detailScroll, this.detailMaxScroll) - 1);
			this.isFollowing = false;
			this.tui.requestRender();
			return;
		}
		if (isDownKey(data)) {
			this.detailScroll = Math.min(this.detailMaxScroll, this.detailScroll + 1);
			if (this.detailScroll >= this.detailMaxScroll) this.isFollowing = true;
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
		this.detailScroll = 0;
		this.detailMaxScroll = 0;
		this.isFollowing = true;
		this.isPromptExpanded = false;
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
		this.selectedTaskId = defaultSelectionId(this.tasks);
	}

	private readTasks(): RunnerSubagentFleetTaskSnapshot[] {
		const runs = this.registry.snapshot();
		const parent = parentSessionEntry(runs, this.fallbackParentSessionFile);
		const tasks = sortedFleetTasks(runs);
		return parent === undefined ? tasks : [parent, ...tasks];
	}

	private selectedTask(): RunnerSubagentFleetTaskSnapshot | undefined {
		return this.tasks.find((task) => task.id === this.selectedTaskId);
	}

	private listHeader(): string[] {
		const counts = fleetCounts(this.tasks);
		return [
			`explore fleet: ${counts.running} running · ${counts.queued} queued · ${counts.done} done`,
		];
	}

	private listBody(innerWidth: number, bodyRows: number): string[] {
		if (this.tasks.length === 0) {
			return ["No explore subagents have run in this Pi session yet."];
		}
		const selectedIndex = Math.max(
			0,
			this.tasks.findIndex((task) => task.id === this.selectedTaskId),
		);
		const window = windowRange(this.tasks.length, selectedIndex, bodyRows);
		const lines = this.tasks
			.slice(window.start, window.end)
			.map((task) => this.listTaskLine(task, innerWidth));
		if (window.start > 0) lines[0] = `… ${window.start} earlier`;
		if (window.end < this.tasks.length) {
			lines[lines.length - 1] = `… ${this.tasks.length - window.end} more`;
		}
		return lines;
	}

	private listTaskLine(task: RunnerSubagentFleetTaskSnapshot, innerWidth: number): string {
		const marker = task.id === this.selectedTaskId ? "▸" : " ";
		if (task.id === EXPLORE_FLEET_PARENT_ENTRY_ID) {
			return truncatePlain(`${marker} ◉ ${task.title}`, innerWidth);
		}
		const status = task.finalStatus ?? task.state;
		const activity = task.state === "running" ? task.latestActivity : undefined;
		const suffix = activity === undefined ? "" : ` — ${activity}`;
		return truncatePlain(
			`${marker} ${taskIcon(task)} ${task.title} — ${status}${suffix}`,
			innerWidth,
		);
	}

	private detailHeader(): string[] {
		const task = this.selectedTask();
		if (task === undefined) return ["No selected explore task."];
		const detail = this.detail;
		if (detail === undefined) {
			return [task.title, "loading child session…", "", `session: ${task.sessionFile ?? "—"}`];
		}
		return [
			task.title,
			`${detail.state} · ${detail.status} · ${detail.modelText} · ${detail.turnCount} turns / ${detail.toolCount} tools · ${formatElapsed(detail.elapsedMs)}`,
			usageLine(detail),
			`session: ${detail.sessionFile ?? "no session file yet"}`,
		];
	}

	private detailBody(innerWidth: number, bodyRows: number): string[] {
		const detail = this.detail;
		if (detail === undefined) return ["Reading child session…"];
		const lines = this.detailContentLines(detail);
		const viewport = sliceWrappedDetailLinesForViewport({
			lines,
			width: innerWidth,
			rows: bodyRows,
			scroll: this.isFollowing ? Number.MAX_SAFE_INTEGER : this.detailScroll,
		});
		this.detailScroll = viewport.scroll;
		this.detailMaxScroll = viewport.maxScroll;
		return viewport.lines;
	}

	private detailContentLines(detail: ExploreFleetTaskDetail): string[] {
		const lines: string[] = [];
		const prompt = detail.task.prompt;
		if (prompt !== undefined) {
			if (this.isPromptExpanded) {
				lines.push("prompt:", ...prompt.split("\n"), "");
			} else {
				lines.push(truncatePlain(`prompt: ${promptPreview(prompt)} (p to expand)`, 200), "");
			}
		}
		if (detail.message !== undefined) {
			lines.push(detail.message);
			return lines;
		}
		if (detail.timeline.droppedEntryCount > 0) {
			lines.push(`… ${detail.timeline.droppedEntryCount} earlier events dropped`);
		}
		for (const entry of detail.timeline.entries) {
			lines.push(renderTimelineEntry(entry));
		}
		if (detail.timeline.entries.length === 0) {
			lines.push("No timeline events yet.");
		}
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
	const sessionFile = input.task.sessionFile;
	if (sessionFile === undefined) return placeholderDetail(input.task, "no session file yet");
	let jsonl: string;
	try {
		jsonl = await input.readTextFile(sessionFile);
	} catch (error) {
		return placeholderDetail(
			input.task,
			`Could not read session file: ${formatErrorMessage(error)}`,
		);
	}
	const parser = createRunnerSubagentJsonEventParser({
		title: input.task.title,
		sessionFile,
	});
	parser.pushChunk(jsonl);
	parser.finish();
	const snapshot = parser.getSnapshot();
	const timeline = extractRunnerSubagentTimelineFromSessionJsonl(jsonl);
	const usage = await readRunnerSubagentUsageFromSessionFile(sessionFile, () => jsonl);
	return detailFromSnapshot({ task: input.task, sessionFile, snapshot, timeline, usage });
}

function detailFromSnapshot(input: {
	task: RunnerSubagentFleetTaskSnapshot;
	sessionFile: string;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	timeline: RunnerSubagentTimeline;
	usage: RunnerSubagentUsageMetadata;
}): ExploreFleetTaskDetail {
	return {
		task: input.task,
		sessionFile: input.sessionFile,
		modelText: modelText(input.snapshot),
		turnCount: input.snapshot.progress.turnCount,
		toolCount: input.snapshot.progress.toolCount,
		elapsedMs: input.snapshot.progress.elapsedMs,
		state: input.snapshot.progress.state,
		status: input.task.finalStatus ?? input.snapshot.stopReason ?? input.task.state,
		timeline: input.timeline,
		usage: input.usage,
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
		elapsedMs: 0,
		state: task.state,
		status: task.finalStatus ?? task.state,
		timeline: { entries: [], droppedEntryCount: 0 },
		message,
	};
}

function usageLine(detail: ExploreFleetTaskDetail): string {
	const usage = detail.usage;
	if (usage === undefined) return "tokens: unavailable";
	if (usage.status === "unavailable") return `tokens: unavailable (${usage.reason})`;
	const totals = usage.totals;
	const cached = totals.cacheRead + totals.cacheWrite;
	return `tokens: ${formatTokenCount(totals.input)} in · ${formatTokenCount(totals.output)} out · ${formatTokenCount(cached)} cached · $${totals.cost.total.toFixed(3)}`;
}

function formatTokenCount(count: number): string {
	if (count < 1000) return String(count);
	return `${(count / 1000).toFixed(1)}k`;
}

function promptPreview(prompt: string): string {
	const firstLine = prompt.split("\n", 1)[0] ?? "";
	return firstLine;
}

function fleetCounts(tasks: readonly RunnerSubagentFleetTaskSnapshot[]): {
	running: number;
	queued: number;
	done: number;
} {
	const children = tasks.filter((task) => task.id !== EXPLORE_FLEET_PARENT_ENTRY_ID);
	return {
		running: children.filter((task) => task.state === "running").length,
		queued: children.filter((task) => task.state === "queued").length,
		done: children.filter((task) => task.state === "done").length,
	};
}

/**
 * The parent Pi session rendered as a pinned navigator entry: opening it reuses
 * the same session-file detail view the child explorers get.
 */
function parentSessionEntry(
	runs: readonly RunnerSubagentFleetRunSnapshot[],
	fallbackSessionFile?: string,
): RunnerSubagentFleetTaskSnapshot | undefined {
	const sessionFile =
		runs
			.map((run) => run.parentSessionFile)
			.filter((file) => file !== undefined)
			.at(-1) ?? fallbackSessionFile;
	if (sessionFile === undefined) return undefined;
	return {
		id: EXPLORE_FLEET_PARENT_ENTRY_ID,
		runId: EXPLORE_FLEET_PARENT_ENTRY_ID,
		index: -1,
		title: PARENT_ENTRY_TITLE,
		state: "running",
		sessionFile,
	};
}

function defaultSelectionId(tasks: readonly RunnerSubagentFleetTaskSnapshot[]): string | undefined {
	return (tasks.find((task) => task.id !== EXPLORE_FLEET_PARENT_ENTRY_ID) ?? tasks[0])?.id;
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

function padRows(lines: readonly string[], rows: number): string[] {
	const padded = lines.slice(0, rows);
	while (padded.length < rows) padded.push("");
	return padded;
}

function readTerminalRows(tui: object): number | undefined {
	if (!("terminal" in tui)) return undefined;
	const terminal = tui.terminal;
	if (typeof terminal !== "object" || terminal === null || !("rows" in terminal)) return undefined;
	const rows = terminal.rows;
	return typeof rows === "number" ? rows : undefined;
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

function hasRegisterShortcut(value: object): value is ShortcutRegistrarHost {
	return "registerShortcut" in value && typeof value.registerShortcut === "function";
}
