import { readFile } from "node:fs/promises";

import { Key, matchesKey, type KeyId } from "@earendil-works/pi-tui";
import type { Clock } from "@nseng-ai/foundation/clock";
import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { systemClock } from "@nseng-ai/foundation/time";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import { unrefTimerScheduler } from "@nseng-ai/pi/shared/timers";
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
	RunnerSubagentCurrentAction,
	RunnerSubagentTimeline,
	RunnerSubagentTimelineEntry,
} from "../runner-subagents/timeline.ts";
import type {
	SubagentFleetRegistry,
	SubagentFleetRunSnapshot,
	SubagentFleetTaskSnapshot,
} from "./registry.ts";
import type { RunnerSubagentUsageMetadata } from "../runner-subagents/extension-api.ts";
import { SUBAGENT_FLEET_COMMAND_NAME, SUBAGENT_FLEET_SHORTCUTS } from "./contract.ts";
import {
	formatSubagentFleetTaskLines,
	latestParentSessionFile,
	sortedFleetTasks,
	taskIcon,
} from "./display.ts";
import type { ReadTextFile, ReadTextFileDependencies } from "./read-text-dependencies.ts";
import type { GitHeadSnapshot } from "./git-head.ts";
import type { ReadWorktreeState, WorktreeStateSnapshot } from "./worktree-state.ts";

export { SUBAGENT_FLEET_COMMAND_NAME, SUBAGENT_FLEET_SHORTCUTS } from "./contract.ts";

export const SUBAGENT_FLEET_PARENT_ENTRY_ID = "parent-session";
const PARENT_ENTRY_TITLE = "Parent Pi session";

const LIST_FOOTER = "↑/k ↓/j move · Enter/o open · q/Esc close";
const DETAIL_FOOTER = "↑/k ↓/j scroll · f follow · p prompt · r reload · b back · q/Esc close";
const DEFAULT_DETAIL_REFRESH_INTERVAL_MS = 1_000;

export interface SubagentFleetTaskLiveActivity {
	currentAction: RunnerSubagentCurrentAction;
	quietMs?: number;
}

export interface SubagentFleetPostRunSummary {
	status: string;
	lastDiagnostic?: string;
	commit: SubagentFleetPostRunCommitSummary;
	worktreeState?: WorktreeStateSnapshot;
}

export type SubagentFleetPostRunCommitSummary =
	| { status: "changed"; from: string; to: string }
	| { status: "unchanged"; head: string }
	| { status: "unavailable"; reason: string };

export interface SubagentFleetTaskDetail {
	title: string;
	prompt?: string;
	sessionFile?: string;
	modelText: string;
	turnCount: number;
	toolCount: number;
	elapsedMs: number;
	state: string;
	status: string;
	timeline: RunnerSubagentTimeline;
	usage?: RunnerSubagentUsageMetadata;
	liveActivity?: SubagentFleetTaskLiveActivity;
	worktreeState?: WorktreeStateSnapshot;
	postRunSummary?: SubagentFleetPostRunSummary;
	message?: string;
}

/**
 * The slice of the command/shortcut context the navigator needs. Structurally
 * satisfied both by `CommandContext` and by the host's shortcut-handler context.
 */
export interface SubagentFleetNavigatorContext {
	cwd: string;
	hasUI: boolean;
	sessionManager?: { getSessionFile?(): string | undefined };
	ui: Pick<CommandContext["ui"], "notify" | "custom">;
}

export type CommandRegistrar = (
	name: string,
	options: {
		description?: string;
		handler(args: string, ctx: CommandContext): Promise<void> | void;
	},
) => void;

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
	task: SubagentFleetTaskSnapshot;
}

type FleetNavigatorEntry = ParentFleetNavigatorEntry | TaskFleetNavigatorEntry;

interface DetailObservationState {
	key: string;
	contentSignature: string;
	lastObservedChangeMs: number;
}

interface LoadedFleetEntryDetail {
	detail: SubagentFleetTaskDetail;
	sessionContentSignature?: string;
}

export function registerSubagentFleetCommand<TPi extends object>(input: {
	pi: TPi;
	registry: SubagentFleetRegistry;
	dependencies?: ReadTextFileDependencies;
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
	registry: SubagentFleetRegistry;
	dependencies?: ReadTextFileDependencies;
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
	registry: SubagentFleetRegistry;
	dependencies?: ReadTextFileDependencies;
}): Promise<void> {
	const parentSessionFile = input.ctx.sessionManager?.getSessionFile?.();
	const readTextFile =
		input.dependencies?.readTextFile ?? ((path: string) => readFile(path, "utf8"));
	if (!input.ctx.hasUI || input.ctx.ui.custom === undefined) {
		const lines = await formatNoUiSubagentFleetLines({
			registry: input.registry,
			readTextFile,
			parentSessionFile,
		});
		input.ctx.ui.notify(
			lines.length === 0 ? "No subagents have run in this Pi session yet." : lines.join("\n"),
			"info",
		);
		return;
	}
	await input.ctx.ui.custom<undefined>(
		(tui, _theme, _keybindings, done) =>
			new SubagentFleetNavigator({
				tui,
				registry: input.registry,
				readTextFile,
				readWorktreeState: input.dependencies?.readWorktreeState ?? readWorktreeStateUnavailable,
				cwd: input.ctx.cwd,
				done,
				...(parentSessionFile === undefined ? {} : { parentSessionFile }),
			}),
		overlayHostOptions(),
	);
}

async function formatNoUiSubagentFleetLines(input: {
	registry: SubagentFleetRegistry;
	readTextFile: ReadTextFile;
	parentSessionFile: string | undefined;
}): Promise<string[]> {
	const lines = formatSubagentFleetTaskLines(input.registry.snapshot());
	if (lines.length === 0 && input.parentSessionFile !== undefined) {
		lines.push(
			"subagent fleet: no subagent runs yet",
			`◉ parent session — ${input.parentSessionFile}`,
		);
	}
	const tasks = input.registry.tasksWithSessionFiles().slice(0, 3);
	for (const task of tasks) {
		lines.push(...(await formatNoUiTaskSummary({ task, readTextFile: input.readTextFile })));
	}
	return lines;
}

async function formatNoUiTaskSummary(input: {
	task: SubagentFleetTaskSnapshot;
	readTextFile: ReadTextFile;
}): Promise<string[]> {
	try {
		const detail = await loadFleetTaskDetail(input);
		return [
			truncatePlain(
				`  ${detail.title}: ${detail.status} — ${detail.sessionFile ?? "no session file"}`,
				180,
			),
			`    ${detail.modelText}; turns=${detail.turnCount}, tools=${detail.toolCount}, state=${detail.state}`,
			...(detail.message === undefined ? [] : [truncatePlain(`    ${detail.message}`, 180)]),
		];
	} catch (error) {
		return [
			truncatePlain(
				`  ${input.task.title}: could not read transcript summary: ${formatErrorMessage(error)}`,
				180,
			),
		];
	}
}

export interface SubagentFleetNavigatorOptions {
	tui: Pick<TuiHandle, "requestRender"> & { readonly terminal?: { readonly rows?: number } };
	registry: SubagentFleetRegistry;
	readTextFile: ReadTextFile;
	readWorktreeState?: ReadWorktreeState;
	cwd: string;
	done(value: undefined): void;
	/** Parent Pi session file resolved at open time; keeps the parent entry present before any run. */
	parentSessionFile?: string;
	clock?: Clock;
	timers?: TimerScheduler;
	detailRefreshIntervalMs?: number;
}

export class SubagentFleetNavigator implements RenderComponent {
	private readonly tui: Pick<TuiHandle, "requestRender">;
	private readonly registry: SubagentFleetRegistry;
	private readonly readTextFile: ReadTextFile;
	private readonly readWorktreeState: ReadWorktreeState;
	private readonly cwd: string;
	private readonly done: (value: undefined) => void;
	private readonly fallbackParentSessionFile: string | undefined;
	private readonly clock: Clock;
	private readonly timers: TimerScheduler;
	private readonly detailRefreshIntervalMs: number;
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
	private detailPollTimer: ScheduledTimer | undefined;
	private detailObservation: DetailObservationState | undefined;

	constructor(options: SubagentFleetNavigatorOptions) {
		this.tui = options.tui;
		this.registry = options.registry;
		this.readTextFile = options.readTextFile;
		this.readWorktreeState = options.readWorktreeState ?? readWorktreeStateUnavailable;
		this.cwd = options.cwd;
		this.done = options.done;
		this.fallbackParentSessionFile = options.parentSessionFile;
		this.clock = options.clock ?? systemClock;
		this.timers = options.timers ?? unrefTimerScheduler;
		this.detailRefreshIntervalMs =
			options.detailRefreshIntervalMs ?? DEFAULT_DETAIL_REFRESH_INTERVAL_MS;
		this.entries = this.readEntries();
		this.selectedEntryId = defaultSelectionId(this.entries);
		this.unsubscribe = this.registry.subscribe(() => {
			this.refreshEntries();
			this.syncDetailPolling();
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
		this.stopDetailPolling();
		this.hasQueuedRead = false;
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
			this.detailObservation = undefined;
			this.stopDetailPolling();
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
		this.detailObservation = undefined;
		this.syncDetailPolling();
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
		const loaded = await loadFleetEntryDetail({
			entry,
			readTextFile: this.readTextFile,
			readWorktreeState: this.readWorktreeState,
			cwd: this.cwd,
		});
		this.isReadInFlight = false;
		if (!this.isDisposed && this.mode === "detail" && this.selectedEntryId === entryId(entry)) {
			this.detail = this.detailWithLiveObservation(entry, loaded);
			this.syncDetailPolling();
			this.tui.requestRender();
		}
		if (!this.isDisposed && this.hasQueuedRead) {
			this.hasQueuedRead = false;
			this.scheduleDetailLoad();
		}
	}

	private detailWithLiveObservation(
		entry: FleetNavigatorEntry,
		loaded: LoadedFleetEntryDetail,
	): SubagentFleetTaskDetail {
		if (!isRunningTaskDetailEntry(entry)) {
			this.detailObservation = undefined;
			return loaded.detail;
		}
		const currentAction = assumeThinkingWhileRunning(loaded.detail.timeline.currentAction);
		const quietMs = this.observeDetailQuietMs(entry, loaded.sessionContentSignature);
		return {
			...loaded.detail,
			liveActivity: {
				currentAction,
				...(quietMs === undefined ? {} : { quietMs }),
			},
		};
	}

	private observeDetailQuietMs(
		entry: FleetNavigatorEntry,
		contentSignature: string | undefined,
	): number | undefined {
		const sessionFile = entrySessionFile(entry);
		if (sessionFile === undefined || contentSignature === undefined) return undefined;
		const key = `${entryId(entry) ?? "unknown"}:${sessionFile}`;
		const nowMs = this.clock.nowMs();
		if (
			this.detailObservation?.key !== key ||
			this.detailObservation.contentSignature !== contentSignature
		) {
			this.detailObservation = { key, contentSignature, lastObservedChangeMs: nowMs };
			return 0;
		}
		return Math.max(0, nowMs - this.detailObservation.lastObservedChangeMs);
	}

	private syncDetailPolling(): void {
		if (!this.shouldPollDetail()) {
			this.stopDetailPolling();
			return;
		}
		if (this.detailPollTimer !== undefined) return;
		this.detailPollTimer = this.timers.setInterval(() => {
			if (this.isDisposed) return;
			if (!this.shouldPollDetail()) {
				this.stopDetailPolling();
				return;
			}
			this.scheduleDetailLoad();
		}, this.detailRefreshIntervalMs);
	}

	private shouldPollDetail(): boolean {
		return this.mode === "detail" && isRunningTaskDetailEntry(this.selectedEntry());
	}

	private stopDetailPolling(): void {
		this.detailPollTimer?.cancel();
		this.detailPollTimer = undefined;
	}

	private refreshEntries(): void {
		const previousSelectedEntryId = this.selectedEntryId;
		this.entries = this.readEntries();
		if (
			this.selectedEntryId !== undefined &&
			this.entries.some((entry) => entryId(entry) === this.selectedEntryId)
		) {
			return;
		}
		this.selectedEntryId = defaultSelectionId(this.entries);
		if (this.selectedEntryId !== previousSelectedEntryId) this.detailObservation = undefined;
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
			return ["No subagents have run in this Pi session yet."];
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
		if (entry === undefined) return ["No selected subagent task."];
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
			...usageTrendLines(detail),
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
		const prompt = detail.prompt;
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
		const postRunSummaryLines = renderPostRunSummaryLines(detail.postRunSummary);
		if (postRunSummaryLines.length > 0) {
			lines.push(...postRunSummaryLines, "");
		} else {
			const currentActionLines = renderCurrentActionLines(detail);
			if (currentActionLines.length > 0) lines.push(...currentActionLines, "");
			const worktreeStateLines = renderWorktreeStateLines(detail);
			if (worktreeStateLines.length > 0) lines.push(...worktreeStateLines, "");
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
	task: SubagentFleetTaskSnapshot;
	readTextFile: ReadTextFile;
	readWorktreeState?: ReadWorktreeState;
	cwd?: string;
}): Promise<SubagentFleetTaskDetail> {
	const loaded = await loadFleetEntryDetail({
		entry: { kind: "task", task: input.task },
		readTextFile: input.readTextFile,
		readWorktreeState: input.readWorktreeState ?? readWorktreeStateUnavailable,
		cwd: input.cwd ?? process.cwd(),
	});
	return loaded.detail;
}

async function loadFleetEntryDetail(input: {
	entry: FleetNavigatorEntry;
	readTextFile: ReadTextFile;
	readWorktreeState: ReadWorktreeState;
	cwd: string;
}): Promise<LoadedFleetEntryDetail> {
	const worktreeState = await loadEntryWorktreeState(input);
	const sessionFile = entrySessionFile(input.entry);
	if (sessionFile === undefined)
		return { detail: placeholderDetail(input.entry, "no session file yet", worktreeState) };
	let jsonl: string;
	try {
		jsonl = await input.readTextFile(sessionFile);
	} catch (error) {
		return {
			detail: placeholderDetail(
				input.entry,
				`Could not read session file: ${formatErrorMessage(error)}`,
				worktreeState,
			),
		};
	}
	const parser = createRunnerSubagentJsonEventParser({
		title: entryTitle(input.entry),
		sessionFile,
	});
	parser.pushChunk(jsonl);
	parser.finish();
	const snapshot = parser.getSnapshot();
	const timeline = extractRunnerSubagentTimelineFromSessionJsonl(jsonl);
	const usage = await readRunnerSubagentUsageFromSessionFile(sessionFile, () => jsonl);
	return {
		detail: detailFromSnapshot({
			entry: input.entry,
			sessionFile,
			snapshot,
			timeline,
			usage,
			...(worktreeState === undefined ? {} : { worktreeState }),
		}),
		sessionContentSignature: sessionContentSignature(jsonl),
	};
}

function detailFromSnapshot(input: {
	entry: FleetNavigatorEntry;
	sessionFile: string;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	timeline: RunnerSubagentTimeline;
	usage: RunnerSubagentUsageMetadata;
	worktreeState?: WorktreeStateSnapshot;
}): SubagentFleetTaskDetail {
	const task = entryTask(input.entry);
	const status =
		task?.finalStatus ?? input.snapshot.stopReason ?? task?.state ?? input.snapshot.progress.state;
	const postRunSummary =
		task?.state === "done"
			? buildPostRunSummary({
					task,
					snapshot: input.snapshot,
					status,
					...(input.worktreeState === undefined ? {} : { worktreeState: input.worktreeState }),
				})
			: undefined;
	return {
		title: entryTitle(input.entry),
		...(task?.prompt === undefined ? {} : { prompt: task.prompt }),
		sessionFile: input.sessionFile,
		modelText: modelText(input.snapshot),
		turnCount: input.snapshot.progress.turnCount,
		toolCount: input.snapshot.progress.toolCount,
		elapsedMs: input.snapshot.progress.elapsedMs,
		state: input.snapshot.progress.state,
		status,
		timeline: input.timeline,
		usage: input.usage,
		...(input.worktreeState === undefined ? {} : { worktreeState: input.worktreeState }),
		...(postRunSummary === undefined ? {} : { postRunSummary }),
	};
}

function placeholderDetail(
	entry: FleetNavigatorEntry,
	message: string,
	worktreeState?: WorktreeStateSnapshot,
): SubagentFleetTaskDetail {
	const task = entryTask(entry);
	const sessionFile = entrySessionFile(entry);
	return {
		title: entryTitle(entry),
		...(task?.prompt === undefined ? {} : { prompt: task.prompt }),
		...(sessionFile === undefined ? {} : { sessionFile }),
		modelText: "model unknown",
		turnCount: 0,
		toolCount: 0,
		elapsedMs: 0,
		state: task?.state ?? "session",
		status: task?.finalStatus ?? task?.state ?? "session",
		timeline: { entries: [], droppedEntryCount: 0, currentAction: { kind: "idle" } },
		...(worktreeState === undefined ? {} : { worktreeState }),
		message,
	};
}

async function loadEntryWorktreeState(input: {
	entry: FleetNavigatorEntry;
	readWorktreeState: ReadWorktreeState;
	cwd: string;
}): Promise<WorktreeStateSnapshot | undefined> {
	if (input.entry.kind !== "task") return undefined;
	return input.readWorktreeState({ cwd: input.cwd });
}

function readWorktreeStateUnavailable(): Promise<WorktreeStateSnapshot> {
	return Promise.resolve({ status: "unavailable", reason: "git reader unavailable" });
}

function usageLine(detail: SubagentFleetTaskDetail): string {
	const usage = detail.usage;
	if (usage === undefined) return "tokens: unavailable";
	if (usage.status === "unavailable") return `tokens: unavailable (${usage.reason})`;
	const totals = usage.totals;
	const cached = totals.cacheRead + totals.cacheWrite;
	return `tokens: ${formatTokenCount(totals.input)} in · ${formatTokenCount(totals.output)} out · ${formatTokenCount(cached)} cached · $${totals.cost.total.toFixed(3)}`;
}

function usageTrendLines(detail: SubagentFleetTaskDetail): string[] {
	const usage = detail.usage;
	if (usage === undefined || usage.status === "unavailable" || usage.trend === undefined) return [];
	const latest = usage.trend.latestTurn;
	const latestText = `latest +${formatTokenCount(latest.input)} in/+${formatTokenCount(latest.output)} out`;
	const contextText =
		usage.trend.contextWindow === undefined
			? `peak prompt ${formatTokenCount(usage.trend.peakPromptTokens)}`
			: `peak prompt ${formatTokenCount(usage.trend.peakPromptTokens)}/${formatTokenCount(usage.trend.contextWindow)} (${formatContextPercent(usage.trend.peakPromptTokens, usage.trend.contextWindow)})`;
	return [`trend: ${latestText} · ${contextText}`];
}

function formatContextPercent(promptTokens: number, contextWindow: number): string {
	return `${((promptTokens / contextWindow) * 100).toFixed(1)}%`;
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
	const tasks = entries.flatMap((entry) => {
		const task = entryTask(entry);
		return task === undefined ? [] : [task];
	});
	return {
		running: tasks.filter((task) => task.state === "running").length,
		queued: tasks.filter((task) => task.state === "queued").length,
		done: tasks.filter((task) => task.state === "done").length,
	};
}

/** Parent Pi session rendered as a pinned navigator entry above child subagents. */
function parentSessionEntry(
	runs: readonly SubagentFleetRunSnapshot[],
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

function entryTask(entry: FleetNavigatorEntry): SubagentFleetTaskSnapshot | undefined {
	return entry.kind === "task" ? entry.task : undefined;
}

function entrySessionFile(entry: FleetNavigatorEntry): string | undefined {
	return entry.kind === "parent" ? entry.sessionFile : entry.task.sessionFile;
}

function isRunningTaskDetailEntry(
	entry: FleetNavigatorEntry | undefined,
): entry is TaskFleetNavigatorEntry {
	return (
		entry?.kind === "task" && entry.task.state === "running" && entry.task.sessionFile !== undefined
	);
}

function assumeThinkingWhileRunning(
	currentAction: RunnerSubagentCurrentAction,
): RunnerSubagentCurrentAction {
	return currentAction.kind === "idle" ? { kind: "thinking" } : currentAction;
}

function sessionContentSignature(jsonl: string): string {
	const suffix = jsonl.slice(Math.max(0, jsonl.length - 512));
	return `${jsonl.length}:${suffix}`;
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

const MAX_WORKTREE_STATE_FILES = 10;

function buildPostRunSummary(input: {
	task: SubagentFleetTaskSnapshot;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	status: string;
	worktreeState?: WorktreeStateSnapshot;
}): SubagentFleetPostRunSummary {
	const lastDiagnostic = postRunDiagnostic(input.snapshot, input.status);
	return {
		status: input.status,
		...(lastDiagnostic === undefined ? {} : { lastDiagnostic }),
		commit: summarizeHeadChange(input.task.headBaseline, input.task.finalHead),
		...(input.worktreeState === undefined ? {} : { worktreeState: input.worktreeState }),
	};
}

function postRunDiagnostic(
	snapshot: RunnerSubagentJsonEventParserSnapshot,
	status: string,
): string | undefined {
	if (snapshot.terminalExecutionError !== undefined) return snapshot.terminalExecutionError.message;
	if (snapshot.protocolError !== undefined) return snapshot.protocolError.message;
	if (snapshot.errorMessage !== undefined) return snapshot.errorMessage;
	if (snapshot.error !== undefined) return snapshot.error.message;
	if (status !== "final-text" && status !== "completed")
		return `unavailable; final status ${status}`;
	return undefined;
}

function summarizeHeadChange(
	baseline: GitHeadSnapshot | undefined,
	finalHead: GitHeadSnapshot | undefined,
): SubagentFleetPostRunCommitSummary {
	if (baseline === undefined) return { status: "unavailable", reason: "missing baseline HEAD" };
	if (baseline.status === "unavailable") {
		return { status: "unavailable", reason: `baseline HEAD unavailable: ${baseline.reason}` };
	}
	if (finalHead === undefined) return { status: "unavailable", reason: "missing final HEAD" };
	if (finalHead.status === "unavailable") {
		return { status: "unavailable", reason: `final HEAD unavailable: ${finalHead.reason}` };
	}
	if (baseline.oid === finalHead.oid) return { status: "unchanged", head: baseline.oid };
	return { status: "changed", from: baseline.oid, to: finalHead.oid };
}

function renderPostRunSummaryLines(summary: SubagentFleetPostRunSummary | undefined): string[] {
	if (summary === undefined) return [];
	const lines = ["post-run summary:", `  status: ${summary.status}`];
	if (summary.lastDiagnostic !== undefined) {
		lines.push(truncatePlain(`  last diagnostic: ${summary.lastDiagnostic}`, 200));
	}
	lines.push(`  commit: ${formatCommitSummary(summary.commit)}`);
	lines.push(...renderSharedWorktreeSummaryLines(summary.worktreeState));
	return lines;
}

function formatCommitSummary(commit: SubagentFleetPostRunCommitSummary): string {
	switch (commit.status) {
		case "changed":
			return `HEAD changed ${shortOid(commit.from)} → ${shortOid(commit.to)}`;
		case "unchanged":
			return `none detected (HEAD unchanged ${shortOid(commit.head)})`;
		case "unavailable":
			return `unavailable (${commit.reason})`;
		default: {
			const exhaustive: never = commit;
			return exhaustive;
		}
	}
}

function shortOid(oid: string): string {
	return oid.slice(0, 7);
}

function renderSharedWorktreeSummaryLines(
	worktreeState: WorktreeStateSnapshot | undefined,
): string[] {
	if (worktreeState === undefined) return ["  shared worktree: unavailable (not read)"];
	if (worktreeState.status === "unavailable") {
		return [truncatePlain(`  shared worktree: unavailable (${worktreeState.reason})`, 200)];
	}
	if (worktreeState.files.length === 0) return ["  shared worktree: clean"];
	const visibleFiles = worktreeState.files.slice(0, MAX_WORKTREE_STATE_FILES);
	const lines = [`  shared worktree: ${worktreeState.files.length} changed files`];
	for (const file of visibleFiles) {
		const status = file.status === undefined ? "" : `${file.status} `;
		const stat = formatWorktreeStateStat(file);
		const suffix = stat.length === 0 ? "" : ` ${stat}`;
		lines.push(truncatePlain(`    ${status}${file.path}${suffix}`, 200));
	}
	const remaining = worktreeState.files.length - visibleFiles.length;
	if (remaining > 0) lines.push(`    … ${remaining} more`);
	return lines;
}

function renderWorktreeStateLines(detail: SubagentFleetTaskDetail): string[] {
	const worktreeState = detail.worktreeState;
	if (worktreeState === undefined) return [];
	if (worktreeState.status === "unavailable") {
		return [truncatePlain(`worktree state: unavailable (${worktreeState.reason})`, 200)];
	}
	if (worktreeState.files.length === 0) return ["worktree state: clean"];
	const visibleFiles = worktreeState.files.slice(0, MAX_WORKTREE_STATE_FILES);
	const lines = [`worktree state: ${worktreeState.files.length} changed files`];
	for (const file of visibleFiles) {
		const status = file.status === undefined ? "" : `${file.status} `;
		const stat = formatWorktreeStateStat(file);
		const suffix = stat.length === 0 ? "" : ` ${stat}`;
		lines.push(truncatePlain(`  ${status}${file.path}${suffix}`, 200));
	}
	const remaining = worktreeState.files.length - visibleFiles.length;
	if (remaining > 0) lines.push(`  … ${remaining} more`);
	return lines;
}

function formatWorktreeStateStat(file: {
	additions?: number;
	deletions?: number;
	isBinary?: boolean;
}): string {
	if (file.isBinary === true) return "binary";
	if (file.additions === undefined && file.deletions === undefined) return "";
	return `+${file.additions ?? 0}/-${file.deletions ?? 0}`;
}

function renderCurrentActionLines(detail: SubagentFleetTaskDetail): string[] {
	const liveActivity = detail.liveActivity;
	if (liveActivity === undefined || liveActivity.currentAction.kind === "idle") return [];
	const action = liveActivity.currentAction;
	const lines: string[] = [];
	if (action.kind === "thinking") {
		lines.push("current action: thinking / waiting for model output");
	} else {
		const input = action.inputPreview === undefined ? "" : `: ${action.inputPreview}`;
		lines.push(truncatePlain(`current action: ▶ ${action.toolName}${input}`, 200));
		if (action.outputPreview !== undefined) {
			lines.push(truncatePlain(`last output: ${action.outputPreview}`, 200));
		}
	}
	if (liveActivity.quietMs !== undefined)
		lines.push(`heartbeat: quiet ${formatQuietSeconds(liveActivity.quietMs)}s`);
	return lines;
}

function formatQuietSeconds(quietMs: number): number {
	return Math.max(0, Math.floor(quietMs / 1000));
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
