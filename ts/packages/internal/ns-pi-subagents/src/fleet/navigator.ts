import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

import { Key, matchesKey, type KeyId } from "@earendil-works/pi-tui";
import type { Clock } from "@nseng-ai/foundation/clock";
import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
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
	type WrappedDetailViewport,
} from "@internal/pi-tools/overlay-kit";
import type {
	SubagentFleetRegistry,
	SubagentFleetRunSnapshot,
	SubagentFleetTaskSnapshot,
} from "./registry.ts";
import { SUBAGENT_FLEET_COMMAND_NAME, SUBAGENT_FLEET_SHORTCUTS } from "./contract.ts";
import {
	SUBAGENT_FLEET_PARENT_ENTRY_ID,
	assumeThinkingWhileRunning,
	entryId,
	entrySessionFile,
	entryTask,
	isRunningTaskDetailEntry,
	loadFleetEntryDetail,
	loadFleetTaskDetail,
	placeholderDetail,
	type FleetDetailContext,
	type FleetEntrySessionParseCache,
	type FleetNavigatorEntry,
	type LoadedFleetEntryDetail,
	type ParentFleetNavigatorEntry,
	type SubagentFleetTaskDetail,
} from "./detail.ts";
import {
	renderFleetDetailContentLines,
	renderFleetDetailHeaderLines,
	renderFleetEntrySummaryLines,
} from "./detail-render.ts";
import { windowEntryBlocks } from "./entry-block-window.ts";
import {
	formatSubagentFleetTaskLines,
	latestParentSessionFile,
	sortedFleetTasks,
	taskIcon,
} from "./display.ts";
import type { ReadTextFileDependencies } from "./read-text-dependencies.ts";

export { SUBAGENT_FLEET_COMMAND_NAME, SUBAGENT_FLEET_SHORTCUTS } from "./contract.ts";
export { SUBAGENT_FLEET_PARENT_ENTRY_ID, loadFleetTaskDetail } from "./detail.ts";

const PARENT_ENTRY_TITLE = "Parent Pi session";

const LIST_FOOTER = "↑/k ↓/j move · Space expand · Enter/o open · q/Esc close";
const DEFAULT_DETAIL_REFRESH_INTERVAL_MS = 1_000;

/**
 * The slice of the command/shortcut context the navigator needs. Structurally
 * satisfied both by `CommandContext` and by the host's shortcut-handler context.
 */
interface DetailObservationState {
	key: string;
	contentSignature: string;
	lastObservedChangeMs: number;
}

interface DetailSessionParseCacheState {
	key: string;
	cache: FleetEntrySessionParseCache;
}

type DetailLoadResult =
	| { status: "loaded"; cacheKey: string; loaded: LoadedFleetEntryDetail }
	| { status: "failed"; detail: SubagentFleetTaskDetail };

export interface SubagentFleetNavigatorContext {
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
	const detailContext: FleetDetailContext = { readTextFile };
	if (!input.ctx.hasUI || input.ctx.ui.custom === undefined) {
		const lines = await formatNoUiSubagentFleetLines({
			registry: input.registry,
			detailContext,
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
				detailContext,
				done,
				...optionalEntry("parentSessionFile", parentSessionFile),
			}),
		overlayHostOptions(),
	);
}

async function formatNoUiSubagentFleetLines(input: {
	registry: SubagentFleetRegistry;
	detailContext: FleetDetailContext;
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
		lines.push(...(await formatNoUiTaskSummary({ task, context: input.detailContext })));
	}
	return lines;
}

async function formatNoUiTaskSummary(input: {
	task: SubagentFleetTaskSnapshot;
	context: FleetDetailContext;
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
	detailContext: FleetDetailContext;
	done(value: undefined): void;
	/** Parent Pi session file resolved at open time; keeps the parent entry present before any run. */
	parentSessionFile?: string;
	clock?: Clock;
	timers?: TimerScheduler;
	detailRefreshIntervalMs?: number;
	/** Home directory used to abbreviate absolute timeline paths; defaults to os.homedir(). */
	homeDir?: string;
}

export class SubagentFleetNavigator implements RenderComponent {
	private readonly tui: Pick<TuiHandle, "requestRender">;
	private readonly registry: SubagentFleetRegistry;
	private readonly detailContext: FleetDetailContext;
	private readonly done: (value: undefined) => void;
	private readonly fallbackParentSessionFile: string | undefined;
	private readonly clock: Clock;
	private readonly timers: TimerScheduler;
	private readonly detailRefreshIntervalMs: number;
	private readonly homeDir: string;
	private readonly unsubscribe: () => void;
	private mode: "list" | "detail" = "list";
	private entries: FleetNavigatorEntry[];
	private readonly expandedEntryIds = new Set<string>();
	private readonly expandedDetails = new Map<string, SubagentFleetTaskDetail>();
	private readonly expandedSessionParseCaches = new Map<string, FleetEntrySessionParseCache>();
	private readonly expandedReadsInFlight = new Set<string>();
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
	private detailSessionParseCache: DetailSessionParseCacheState | undefined;

	constructor(options: SubagentFleetNavigatorOptions) {
		this.tui = options.tui;
		this.registry = options.registry;
		this.detailContext = options.detailContext;
		this.done = options.done;
		this.fallbackParentSessionFile = options.parentSessionFile;
		this.clock = options.clock ?? systemClock;
		this.timers = options.timers ?? unrefTimerScheduler;
		this.detailRefreshIntervalMs =
			options.detailRefreshIntervalMs ?? DEFAULT_DETAIL_REFRESH_INTERVAL_MS;
		this.homeDir = options.homeDir ?? homedir();
		this.entries = this.readEntries();
		this.selectedEntryId = defaultSelectionId(this.entries);
		this.unsubscribe = this.registry.subscribe(() => {
			this.refreshEntries();
			this.syncRefreshPolling();
			if (this.mode === "detail") this.scheduleDetailLoad();
			this.scheduleExpandedLoads();
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
		let body: string[];
		let footer: string;
		if (this.mode === "detail") {
			const viewport = this.detailViewport(innerWidth, bodyRows);
			this.detailScroll = viewport.scroll;
			this.detailMaxScroll = viewport.maxScroll;
			body = viewport.lines;
			footer = formatDetailFooter(viewport, this.isFollowing);
		} else {
			body = this.listBody(innerWidth, bodyRows);
			footer = LIST_FOOTER;
		}
		return renderOverlayFrame({
			header: header.map((line) => truncatePlain(line, innerWidth)),
			body: padRows(body, bodyRows),
			footer,
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
		this.stopRefreshPolling();
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
		if (isToggleExpandKey(data)) {
			this.toggleSelectedExpansion();
			return;
		}
		if (isOpenKey(data)) this.openSelectedDetail();
	}

	private toggleSelectedExpansion(): void {
		const entry = this.selectedEntry();
		const id = entryId(entry);
		if (id === undefined) return;
		if (this.expandedEntryIds.has(id)) {
			this.expandedEntryIds.delete(id);
			this.expandedDetails.delete(id);
			this.expandedSessionParseCaches.delete(id);
		} else {
			this.expandedEntryIds.add(id);
			this.scheduleExpandedLoad(entry);
		}
		this.syncRefreshPolling();
		this.tui.requestRender();
	}

	private handleDetailInput(data: string): void {
		if (isCloseKey(data)) {
			this.close();
			return;
		}
		if (data === "b") {
			this.mode = "list";
			this.detail = undefined;
			this.resetDetailSessionState();
			this.scheduleExpandedLoads();
			this.syncRefreshPolling();
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
		this.resetDetailSessionState();
		this.syncRefreshPolling();
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
		try {
			let result: DetailLoadResult;
			try {
				const cacheKey = entrySessionIdentityKey(entry);
				const previous =
					this.detailSessionParseCache?.key === cacheKey
						? this.detailSessionParseCache.cache
						: undefined;
				const loaded = await loadFleetEntryDetail({
					entry,
					context: this.detailContext,
					...optionalEntry("previous", previous),
				});
				result = { status: "loaded", cacheKey, loaded };
			} catch (error) {
				result = {
					status: "failed",
					detail: placeholderDetail(entry, `Could not load detail: ${formatErrorMessage(error)}`),
				};
			}

			if (!this.isDisposed && this.mode === "detail" && this.selectedEntryId === entryId(entry)) {
				if (result.status === "loaded") {
					this.detailSessionParseCache =
						result.loaded.sessionParseCache === undefined
							? undefined
							: { key: result.cacheKey, cache: result.loaded.sessionParseCache };
					this.detail = this.detailWithLiveObservation(entry, result.loaded);
				} else {
					this.detail = result.detail;
				}
				this.syncRefreshPolling();
				this.tui.requestRender();
			}
		} finally {
			this.isReadInFlight = false;
			if (!this.isDisposed && this.hasQueuedRead) {
				this.hasQueuedRead = false;
				this.scheduleDetailLoad();
			}
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
				...optionalEntry("quietMs", quietMs),
			},
		};
	}

	private observeDetailQuietMs(
		entry: FleetNavigatorEntry,
		contentSignature: string | undefined,
	): number | undefined {
		const sessionFile = entrySessionFile(entry);
		if (sessionFile === undefined || contentSignature === undefined) return undefined;
		const key = entrySessionIdentityKey(entry);
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

	private scheduleExpandedLoads(): void {
		if (this.mode !== "list") return;
		for (const entry of this.entries) {
			const id = entryId(entry);
			if (id !== undefined && this.expandedEntryIds.has(id)) this.scheduleExpandedLoad(entry);
		}
	}

	private scheduleExpandedLoad(entry: FleetNavigatorEntry | undefined): void {
		const id = entryId(entry);
		if (entry === undefined || id === undefined || this.expandedReadsInFlight.has(id)) return;
		this.expandedReadsInFlight.add(id);
		void this.runExpandedLoad(entry, id);
	}

	private async runExpandedLoad(entry: FleetNavigatorEntry, id: string): Promise<void> {
		try {
			const previous = this.expandedSessionParseCaches.get(id);
			const loaded = await loadFleetEntryDetail({
				entry,
				context: this.detailContext,
				...optionalEntry("previous", previous),
			});
			if (this.isDisposed || !this.expandedEntryIds.has(id)) return;
			const detail = isRunningTaskDetailEntry(entry)
				? {
						...loaded.detail,
						liveActivity: {
							currentAction: assumeThinkingWhileRunning(loaded.detail.timeline.currentAction),
						},
					}
				: loaded.detail;
			this.expandedDetails.set(id, detail);
			if (loaded.sessionParseCache === undefined) {
				this.expandedSessionParseCaches.delete(id);
			} else {
				this.expandedSessionParseCaches.set(id, loaded.sessionParseCache);
			}
			this.tui.requestRender();
		} catch (error) {
			if (!this.isDisposed && this.expandedEntryIds.has(id)) {
				this.expandedDetails.set(
					id,
					placeholderDetail(entry, `Could not load detail: ${formatErrorMessage(error)}`),
				);
				this.tui.requestRender();
			}
		} finally {
			this.expandedReadsInFlight.delete(id);
			const currentEntry = this.entries.find((candidate) => entryId(candidate) === id);
			if (currentEntry !== undefined && currentEntry !== entry && this.expandedEntryIds.has(id)) {
				this.scheduleExpandedLoad(currentEntry);
			}
		}
	}

	private syncRefreshPolling(): void {
		if (!this.shouldPoll()) {
			this.stopRefreshPolling();
			return;
		}
		if (this.detailPollTimer !== undefined) return;
		this.detailPollTimer = this.timers.setInterval(() => {
			if (this.isDisposed) return;
			if (!this.shouldPoll()) {
				this.stopRefreshPolling();
				return;
			}
			if (this.mode === "detail") this.scheduleDetailLoad();
			this.scheduleExpandedLoads();
		}, this.detailRefreshIntervalMs);
	}

	private shouldPoll(): boolean {
		if (this.mode === "detail") return isRunningTaskDetailEntry(this.selectedEntry());
		return this.entries.some((entry) => {
			const id = entryId(entry);
			return id !== undefined && this.expandedEntryIds.has(id) && isRunningTaskDetailEntry(entry);
		});
	}

	private stopRefreshPolling(): void {
		this.detailPollTimer?.cancel();
		this.detailPollTimer = undefined;
	}

	private refreshEntries(): void {
		const previousSelectedEntryId = this.selectedEntryId;
		this.entries = this.readEntries();
		this.pruneExpandedEntries();
		if (
			this.selectedEntryId !== undefined &&
			this.entries.some((entry) => entryId(entry) === this.selectedEntryId)
		) {
			return;
		}
		this.selectedEntryId = defaultSelectionId(this.entries);
		if (this.selectedEntryId !== previousSelectedEntryId) {
			this.resetDetailSessionState();
		}
	}

	private resetDetailSessionState(): void {
		this.detailObservation = undefined;
		this.detailSessionParseCache = undefined;
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
		const blocks = this.entries.map((entry) => this.listEntryBlock(entry, innerWidth));
		return windowEntryBlocks(blocks, selectedIndex, bodyRows);
	}

	private listEntryBlock(entry: FleetNavigatorEntry, innerWidth: number): string[] {
		const line = this.listEntryLine(entry, innerWidth);
		const id = entryId(entry);
		if (id === undefined || !this.expandedEntryIds.has(id)) return [line];
		const detail = this.expandedDetails.get(id);
		return [
			line,
			...renderFleetEntrySummaryLines({
				entry,
				detail,
				nowMs: this.clock.nowMs(),
				timelineContext: {
					...optionalEntry("sessionCwd", detail?.sessionCwd),
					homeDir: this.homeDir,
				},
			}).map((detailLine) => truncatePlain(`      ${detailLine}`, innerWidth)),
		];
	}

	private pruneExpandedEntries(): void {
		const liveIds = new Set(
			this.entries.flatMap((entry) => {
				const id = entryId(entry);
				return id === undefined ? [] : [id];
			}),
		);
		for (const id of this.expandedEntryIds) {
			if (liveIds.has(id)) continue;
			this.expandedEntryIds.delete(id);
			this.expandedDetails.delete(id);
			this.expandedSessionParseCaches.delete(id);
		}
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
		return renderFleetDetailHeaderLines({
			entry: this.selectedEntry(),
			detail: this.detail,
			nowMs: this.clock.nowMs(),
		});
	}

	private detailViewport(innerWidth: number, bodyRows: number): WrappedDetailViewport {
		const detail = this.detail;
		if (detail === undefined) return { lines: ["Reading child session…"], scroll: 0, maxScroll: 0 };
		return sliceWrappedDetailLinesForViewport({
			lines: this.detailContentLines(detail),
			width: innerWidth,
			rows: bodyRows,
			scroll: this.isFollowing ? Number.MAX_SAFE_INTEGER : this.detailScroll,
		});
	}

	private detailContentLines(detail: SubagentFleetTaskDetail): string[] {
		return renderFleetDetailContentLines({
			detail,
			isPromptExpanded: this.isPromptExpanded,
			timelineContext: {
				...optionalEntry("sessionCwd", detail.sessionCwd),
				homeDir: this.homeDir,
			},
		});
	}

	private close(): void {
		this.dispose();
		this.done(undefined);
	}
}

function formatDetailFooter(
	viewport: Pick<WrappedDetailViewport, "scroll" | "maxScroll">,
	isFollowing: boolean,
): string {
	const hiddenBelow = Math.max(0, viewport.maxScroll - viewport.scroll);
	const followSegment = isFollowing
		? "f follow ●"
		: hiddenBelow > 0
			? `↓ ${hiddenBelow} below · f follow`
			: "f follow ○";
	return `↑/k ↓/j scroll · ${followSegment} · p prompt · b back · q close`;
}

function entrySessionIdentityKey(entry: FleetNavigatorEntry): string {
	return `${entryId(entry) ?? "unknown"}:${entrySessionFile(entry) ?? "no-session-file"}`;
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

function isToggleExpandKey(data: string): boolean {
	return isKey(data, Key.space, " ");
}

function hasRegisterCommand(value: object): value is CommandRegistrarHost {
	return "registerCommand" in value && typeof value.registerCommand === "function";
}

function hasRegisterShortcut(value: object): value is ShortcutRegistrarHost {
	return "registerShortcut" in value && typeof value.registerShortcut === "function";
}
