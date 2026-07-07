import { readFile } from "node:fs/promises";

import { Key, matchesKey, type KeyId } from "@earendil-works/pi-tui";
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
import { readRunnerSubagentUsageFromSessionFile } from "../runner-subagents/extension-usage.ts";
import { formatRunnerSubagentElapsed } from "../runner-subagents/presentation.ts";
import {
	createRunnerSubagentJsonEventParser,
	type RunnerSubagentJsonEventParserSnapshot,
} from "../runner-subagents/json-events.ts";
import { extractRunnerSubagentTimelineFromSessionJsonl } from "../runner-subagents/timeline.ts";
import type {
	RunnerSubagentTimeline,
	RunnerSubagentTimelineEntry,
} from "../runner-subagents/timeline.ts";
import type {
	RunnerSubagentFleetRegistry,
	RunnerSubagentFleetRunSnapshot,
	RunnerSubagentFleetTaskSnapshot,
} from "../runner-subagents/fleet.ts";
import type { RunnerSubagentUsageMetadata } from "../runner-subagents/extension-api.ts";
import { SUBAGENT_FLEET_COMMAND_NAME, SUBAGENT_FLEET_SHORTCUTS } from "./contract.ts";
import {
	formatSubagentFleetTaskLines,
	latestParentSessionFile,
	sortedFleetTasks,
	taskIcon,
} from "./display.ts";
import type {
	ExploreReadTextFileDependencies,
	ReadTextFile,
} from "../explore/read-text-dependencies.ts";
import type { CommandRegistrar } from "./transcript-viewer.ts";

export { SUBAGENT_FLEET_COMMAND_NAME, SUBAGENT_FLEET_SHORTCUTS } from "./contract.ts";

export const SUBAGENT_FLEET_PARENT_ENTRY_ID = "parent-session";
const PARENT_ENTRY_TITLE = "Parent Pi session";

const LIST_FOOTER = "↑/k ↓/j move · Enter/o open · q/Esc close";
const DETAIL_FOOTER = "↑/k ↓/j scroll · f follow · p prompt · r reload · b back · q/Esc close";

export type SubagentFleetNavigatorDependencies = ExploreReadTextFileDependencies;

export interface SubagentFleetTaskDetail {
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
export interface SubagentFleetNavigatorContext {
	hasUI: boolean;
	sessionManager?: { getSessionFile?(): string | undefined };
	ui: Pick<CommandContext["ui"], "notify" | "custom">;
}

export type RegisterShortcutFunction = (
	shortcut: string,
	options: {
		description?: string;
		handler: (ctx: SubagentFleetNavigatorContext) => Promise<void> | void;
	},
) => void;

interface CommandRegistrarHost {
	registerCommand: CommandRegistrar;
}

interface ShortcutRegistrarHost {
	registerShortcut: RegisterShortcutFunction;
}

interface ParentFleetNavigatorEntry {
	kind: "parent";
	id: typeof SUBAGENT_FLEET_PARENT_ENTRY_ID;
	title: string;
	sessionFile: string;
}

interface TaskFleetNavigatorEntry {
	kind: "task";
	task: RunnerSubagentFleetTaskSnapshot;
}

type FleetNavigatorEntry = ParentFleetNavigatorEntry | TaskFleetNavigatorEntry;

export function registerSubagentFleetCommand<TPi extends object>(input: {
	pi: TPi;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: SubagentFleetNavigatorDependencies;
}): void {
	if (!hasRegisterCommand(input.pi)) return;
	const host: CommandRegistrarHost = input.pi;
	registerCommandWithImmediateAck({
		host,
		commandName: SUBAGENT_FLEET_COMMAND_NAME,
		commandDefinition: {
			description: "Open a read-only navigator for subagent child sessions.",
			async handler(_args: string, ctx: CommandContext) {
				await openSubagentFleetNavigator({
					ctx,
					registry: input.registry,
					...(input.dependencies === undefined ? {} : { dependencies: input.dependencies }),
				});
			},
		},
	});
}

export function registerSubagentFleetShortcut<TPi extends object>(input: {
	pi: TPi;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: SubagentFleetNavigatorDependencies;
}): void {
	if (!hasRegisterShortcut(input.pi)) return;
	for (const shortcut of SUBAGENT_FLEET_SHORTCUTS) {
		input.pi.registerShortcut(shortcut, {
			description: "Open the subagent fleet navigator.",
			async handler(ctx: SubagentFleetNavigatorContext) {
				await openSubagentFleetNavigator({
					ctx,
					registry: input.registry,
					...(input.dependencies === undefined ? {} : { dependencies: input.dependencies }),
				});
			},
		});
	}
}

export async function openSubagentFleetNavigator(input: {
	ctx: SubagentFleetNavigatorContext;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: SubagentFleetNavigatorDependencies;
}): Promise<void> {
	const parentSessionFile = input.ctx.sessionManager?.getSessionFile?.();
	if (!input.ctx.hasUI || input.ctx.ui.custom === undefined) {
		const lines = formatSubagentFleetTaskLines(input.registry.snapshot());
		if (lines.length === 0 && parentSessionFile !== undefined) {
			lines.push("subagent fleet: no subagent runs yet", `◉ parent session — ${parentSessionFile}`);
		}
		input.ctx.ui.notify(
			lines.length === 0
				? "No subagent fleet tasks are known in this Pi session."
				: lines.join("\n"),
			"info",
		);
		return;
	}

	const readTextFile =
		input.dependencies?.readTextFile ?? ((path: string) => readFile(path, "utf8"));
	await input.ctx.ui.custom<undefined>(
		(tui, _theme, _keybindings, done) =>
			new SubagentFleetNavigator({
				tui,
				registry: input.registry,
				readTextFile,
				done,
				...(parentSessionFile === undefined ? {} : { parentSessionFile }),
			}),
		overlayHostOptions(),
	);
}

export interface SubagentFleetNavigatorOptions {
	tui: Pick<TuiHandle, "requestRender"> & { readonly terminal?: { readonly rows?: number } };
	registry: RunnerSubagentFleetRegistry;
	readTextFile: ReadTextFile;
	done(value: undefined): void;
	/** Parent Pi session file resolved at open time; keeps the parent entry present before any run. */
	parentSessionFile?: string;
}

export class SubagentFleetNavigator implements RenderComponent {
	private readonly tui: Pick<TuiHandle, "requestRender">;
	private readonly registry: RunnerSubagentFleetRegistry;
	private readonly readTextFile: ReadTextFile;
	private readonly done: (value: undefined) => void;
	private readonly fallbackParentSessionFile: string | undefined;
	private readonly unsubscribe: () => void;
	private mode: "list" | "detail" = "list";
	private entries: FleetNavigatorEntry[];
	private selectedEntryId: string | undefined;
	private detail: SubagentFleetTaskDetail | undefined;
	private detailScroll = 0;
	private detailMaxScroll = 0;
	private isFollowing = true;
	private isPromptExpanded = false;
	private isReadInFlight = false;
	private hasQueuedRead = false;
	private isDisposed = false;

	constructor(options: SubagentFleetNavigatorOptions) {
		this.tui = options.tui;
		this.registry = options.registry;
		this.readTextFile = options.readTextFile;
		this.done = options.done;
		this.fallbackParentSessionFile = options.parentSessionFile;
		this.entries = this.readEntries();
		this.selectedEntryId = defaultSelectionId(this.entries);
		this.unsubscribe = this.registry.subscribe(() => {
			this.refreshEntries();
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
		if (isOpenKey(data)) this.openSelectedDetail();
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
		if (this.entries.length === 0) return;
		const currentIndex = Math.max(
			0,
			this.entries.findIndex((entry) => entryId(entry) === this.selectedEntryId),
		);
		const nextIndex = Math.min(this.entries.length - 1, Math.max(0, currentIndex + delta));
		this.selectedEntryId = entryId(this.entries[nextIndex]);
		this.tui.requestRender();
	}

	private openSelectedDetail(): void {
		if (this.selectedEntry() === undefined) return;
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
		const entry = this.selectedEntry();
		if (entry === undefined) return;
		this.isReadInFlight = true;
		void this.runDetailLoad(entry);
	}

	private async runDetailLoad(entry: FleetNavigatorEntry): Promise<void> {
		const detail = await loadFleetTaskDetail({
			task: taskSnapshotForDetail(entry),
			readTextFile: this.readTextFile,
		});
		this.isReadInFlight = false;
		if (!this.isDisposed && this.mode === "detail" && this.selectedEntryId === entryId(entry)) {
			this.detail = detail;
			this.tui.requestRender();
		}
		if (!this.isDisposed && this.hasQueuedRead) {
			this.hasQueuedRead = false;
			this.scheduleDetailLoad();
		}
	}

	private refreshEntries(): void {
		this.entries = this.readEntries();
		if (
			this.selectedEntryId !== undefined &&
			this.entries.some((entry) => entryId(entry) === this.selectedEntryId)
		) {
			return;
		}
		this.selectedEntryId = defaultSelectionId(this.entries);
	}

	private readEntries(): FleetNavigatorEntry[] {
		const runs = this.registry.snapshot();
		const parent = parentSessionEntry(runs, this.fallbackParentSessionFile);
		const tasks = sortedFleetTasks(runs).map(
			(task): FleetNavigatorEntry => ({ kind: "task", task }),
		);
		return parent === undefined ? tasks : [parent, ...tasks];
	}

	private selectedEntry(): FleetNavigatorEntry | undefined {
		return this.entries.find((entry) => entryId(entry) === this.selectedEntryId);
	}

	private listHeader(): string[] {
		const counts = fleetCounts(this.entries);
		return [
			`subagent fleet: ${counts.running} running · ${counts.queued} queued · ${counts.done} done`,
		];
	}

	private listBody(innerWidth: number, bodyRows: number): string[] {
		if (this.entries.length === 0) {
			return ["No explore subagents have run in this Pi session yet."];
		}
		const selectedIndex = Math.max(
			0,
			this.entries.findIndex((entry) => entryId(entry) === this.selectedEntryId),
		);
		const window = windowRange(this.entries.length, selectedIndex, bodyRows);
		const lines = this.entries
			.slice(window.start, window.end)
			.map((entry) => this.listEntryLine(entry, innerWidth));
		if (window.start > 0) lines[0] = `… ${window.start} earlier`;
		if (window.end < this.entries.length) {
			lines[lines.length - 1] = `… ${this.entries.length - window.end} more`;
		}
		return lines;
	}

	private listEntryLine(entry: FleetNavigatorEntry, innerWidth: number): string {
		const marker = entryId(entry) === this.selectedEntryId ? "▸" : " ";
		if (entry.kind === "parent") {
			return truncatePlain(`${marker} ◉ ${entry.title}`, innerWidth);
		}
		const task = entry.task;
		const status = task.finalStatus ?? task.state;
		const activity = task.state === "running" ? task.latestActivity : undefined;
		const suffix = activity === undefined ? "" : ` — ${activity}`;
		return truncatePlain(
			`${marker} ${taskIcon(task)} ${task.title} — ${status}${suffix}`,
			innerWidth,
		);
	}

	private detailHeader(): string[] {
		const entry = this.selectedEntry();
		if (entry === undefined) return ["No selected explore task."];
		const detail = this.detail;
		if (detail === undefined) {
			return [
				entryTitle(entry),
				"loading session…",
				"",
				`session: ${entrySessionFile(entry) ?? "—"}`,
			];
		}
		return [
			entryTitle(entry),
			`${detail.state} · ${detail.status} · ${detail.modelText} · ${detail.turnCount} turns / ${detail.toolCount} tools · ${formatRunnerSubagentElapsed(detail.elapsedMs)}`,
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

	private detailContentLines(detail: SubagentFleetTaskDetail): string[] {
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
	readTextFile: ReadTextFile;
}): Promise<SubagentFleetTaskDetail> {
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
}): SubagentFleetTaskDetail {
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
): SubagentFleetTaskDetail {
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

function usageLine(detail: SubagentFleetTaskDetail): string {
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

function fleetCounts(entries: readonly FleetNavigatorEntry[]): {
	running: number;
	queued: number;
	done: number;
} {
	const tasks = entries.flatMap((entry) => (entry.kind === "task" ? [entry.task] : []));
	return {
		running: tasks.filter((task) => task.state === "running").length,
		queued: tasks.filter((task) => task.state === "queued").length,
		done: tasks.filter((task) => task.state === "done").length,
	};
}

/** Parent Pi session rendered as a pinned navigator entry above child explorers. */
function parentSessionEntry(
	runs: readonly RunnerSubagentFleetRunSnapshot[],
	fallbackSessionFile?: string,
): ParentFleetNavigatorEntry | undefined {
	const sessionFile = latestParentSessionFile(runs) ?? fallbackSessionFile;
	if (sessionFile === undefined) return undefined;
	return {
		kind: "parent",
		id: SUBAGENT_FLEET_PARENT_ENTRY_ID,
		title: PARENT_ENTRY_TITLE,
		sessionFile,
	};
}

function defaultSelectionId(entries: readonly FleetNavigatorEntry[]): string | undefined {
	return entryId(entries.find((entry) => entry.kind === "task") ?? entries[0]);
}

function entryId(entry: FleetNavigatorEntry | undefined): string | undefined {
	if (entry === undefined) return undefined;
	return entry.kind === "parent" ? entry.id : entry.task.id;
}

function entryTitle(entry: FleetNavigatorEntry): string {
	return entry.kind === "parent" ? entry.title : entry.task.title;
}

function entrySessionFile(entry: FleetNavigatorEntry): string | undefined {
	return entry.kind === "parent" ? entry.sessionFile : entry.task.sessionFile;
}

function taskSnapshotForDetail(entry: FleetNavigatorEntry): RunnerSubagentFleetTaskSnapshot {
	if (entry.kind === "task") return entry.task;
	return {
		id: entry.id,
		runId: entry.id,
		index: -1,
		title: entry.title,
		state: "running",
		sessionFile: entry.sessionFile,
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

function isKey(data: string, key: KeyId, alias: string): boolean {
	return matchesKey(data, key) || data === alias;
}

function isUpKey(data: string): boolean {
	return isKey(data, Key.up, "k");
}

function isDownKey(data: string): boolean {
	return isKey(data, Key.down, "j");
}

function isCloseKey(data: string): boolean {
	return isKey(data, Key.escape, "q");
}

function isOpenKey(data: string): boolean {
	return isKey(data, Key.enter, "o");
}

function hasRegisterCommand(value: object): value is CommandRegistrarHost {
	return "registerCommand" in value && typeof value.registerCommand === "function";
}

function hasRegisterShortcut(value: object): value is ShortcutRegistrarHost {
	return "registerShortcut" in value && typeof value.registerShortcut === "function";
}
