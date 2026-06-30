import { basename, resolve } from "node:path";

import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
import { isRecord } from "@sdl/core/primitives";
import {
	PI_EXTENSION_COMMAND_FINISHED_EVENT,
	type PiExtensionCommandEventBus,
} from "@sdl/pi/commands/events";
import { unrefTimerScheduler } from "@sdl/pi/shared/timers";
import type { CustomMessageContent } from "@sdl/pi/terminal/presentation";

import type { Clock } from "@sdl/core/clock";
import { systemClock } from "@sdl/time";
import type { TimerScheduler } from "@sdl/core/timers";
import { shutdownGraphiteMetadataWorker } from "@sdl/graphite/status";

import {
	combineWorktreeStatus,
	currentWorktreeStatusBranchName,
	findWorktreeStatusGitPaths,
	formatWorktreeStatus,
	isWorktreeStatusIdentityStillCurrent,
	loadLocalWorktreeStatus,
	loadWorktreeGhStatus,
	loadWorktreeStatusIdentity,
	renderWorktreeStatusMessage,
	repoNameFromWorktreeStatusGitPaths,
	sameWorktreeStatusIdentity,
	WORKTREE_STATUS_UI_KEY,
} from "./status.ts";
import {
	createWorktreeStatusActivityController,
	type WorktreeStatusActivityController,
	type WorktreeStatusActivityOptions,
} from "./activity.ts";
import {
	createWorktreeStatusRefreshChannel,
	remoteRefreshMode,
	type WorktreeStatusRefreshOptions,
	type WorktreeStatusRemoteRefreshMode,
} from "./refresh-channel.ts";
import {
	createWorktreeStatusRefreshTimer,
	WORKTREE_STATUS_ACTIVE_REFRESH_INTERVAL_MS,
	type WorktreeStatusRefreshTimer,
} from "./refresh-timer.ts";
import { renderStatusFooter } from "./footer-format.ts";
import type {
	ExecResult,
	LoadLocalWorktreeStatusOptions,
	LoadWorktreeGhStatusOptions,
	LocalWorktreeStatus,
	StatusTheme,
	WorktreeGhStatus,
	WorktreeStatus,
	WorktreeStatusIdentity,
} from "./types.ts";

export const WORKTREE_STATUS_REFRESH_COMMAND_NAME = "pi:worktree-status-refresh";
export { WORKTREE_STATUS_UI_KEY };

const GH_STATUS_BACKGROUND_REFRESH_MIN_INTERVAL_MS = 30_000;
const GH_STATUS_FRESHNESS_RENDER_INTERVAL_MS = 1_000;

const WORKTREE_STATUS_TOOL_REFRESH_NAMES = new Set(["bash", "edit", "write"]);

type WorktreeStatusActivityEvent =
	| "input"
	| "user_bash"
	| "agent_start"
	| "agent_end"
	| "turn_start"
	| "turn_end"
	| "message_start"
	| "message_end"
	| "tool_execution_start"
	| "tool_execution_end"
	| "model_select"
	| "thinking_level_select";

interface ExecOptions {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
}

export interface ExtensionContext {
	cwd: string;
	hasUI: boolean;
	ui: {
		theme: StatusTheme;
		setStatus(key: string, value: string | undefined): void;
		setWidget(key: string, value: undefined): void;
		setFooter?(factory: StatusFooterFactory | undefined): void;
		onTerminalInput?(handler: TerminalInputHandler): () => void;
	};
	sessionManager?: StatusSessionManager;
	modelRegistry?: StatusModelRegistry;
	model?: StatusModel;
	isIdle?(): boolean;
	hasPendingMessages?(): boolean;
	getContextUsage?(): StatusContextUsage | undefined;
}

interface StatusFooterTui {
	requestRender(): void;
}

interface StatusFooterData {
	getGitBranch(): string | null;
	getExtensionStatuses(): ReadonlyMap<string, string>;
	getAvailableProviderCount(): number;
	onBranchChange(callback: () => void): () => void;
}

interface StatusFooterComponent {
	render(width: number): string[];
	invalidate(): void;
	dispose?(): void;
}

type StatusFooterFactory = (
	tui: StatusFooterTui,
	theme: StatusTheme,
	footerData: StatusFooterData,
) => StatusFooterComponent;

interface StatusSessionManager {
	getEntries(): readonly StatusSessionEntry[];
	getCwd(): string;
	getSessionName(): string | undefined;
}

interface StatusSessionEntry {
	type: string;
	message?: StatusMessage;
}

interface StatusMessage {
	role: string;
	usage: StatusUsage;
}

interface StatusUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: { total: number };
}

interface StatusModelRegistry {
	isUsingOAuth(model: StatusModel): boolean;
}

interface StatusModel {
	id: string;
	provider?: string;
	contextWindow?: number;
	reasoning?: unknown;
}

interface StatusContextUsage {
	contextWindow: number;
	percent: number | null;
}

interface CustomMessage {
	customType: string;
	content: CustomMessageContent;
	display: boolean;
	details?: unknown;
}

interface TerminalInputResult {
	consume?: boolean;
	data?: string;
}

type TerminalInputHandler = (data: string) => TerminalInputResult | undefined;

interface RenderTheme {
	fg(color: string, text: string): string;
}

interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

type MessageRenderer = (
	message: CustomMessage,
	options: { expanded: boolean },
	theme: RenderTheme,
) => RenderComponent;

interface RegisteredCommand {
	description: string;
	handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
}

interface CommandRegistrationExtensionAPI extends ExtensionAPI {
	registerCommand(name: string, options: RegisteredCommand): void;
}

export interface ExtensionAPI {
	readonly events?: PiExtensionCommandEventBus;
	on(
		event: "session_start",
		handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void,
	): void;
	on(event: "session_shutdown", handler: () => Promise<void> | void): void;
	on(
		event: WorktreeStatusActivityEvent,
		handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void,
	): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	registerCommand?(name: string, options: RegisteredCommand): void;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
}

interface GhStatusSnapshot {
	readonly identity: WorktreeStatusIdentity;
	readonly status: WorktreeGhStatus;
	readonly fetchedAtMs: number;
}

export type WorktreeStatusIdentityLoader = (
	pi: ExtensionAPI,
	cwd: string,
	signal?: AbortSignal,
) => Promise<WorktreeStatusIdentity>;

export type LocalWorktreeStatusLoader = (
	pi: ExtensionAPI,
	cwd: string,
	options?: LoadLocalWorktreeStatusOptions,
) => Promise<LocalWorktreeStatus>;

export type WorktreeGhStatusLoader = (
	pi: ExtensionAPI,
	cwd: string,
	options?: LoadWorktreeGhStatusOptions,
) => Promise<WorktreeGhStatus>;

export type WorktreeStatusIdentityCurrentChecker = (
	cwd: string,
	identity: WorktreeStatusIdentity,
) => boolean;

export type WorktreeStatusFooterBranchReader = (
	cwd: string,
	footerData: StatusFooterData,
) => string | null;

/**
 * The observability loaders the extension reads worktree facts through. Bundled
 * into a single dependency so tests inject one object whose shape matches this
 * contract 1:1, and infra seams (timers/clock) stay visibly separate.
 */
export interface WorktreeStatusLoaders {
	loadIdentity: WorktreeStatusIdentityLoader;
	loadLocalStatus: LocalWorktreeStatusLoader;
	loadGhStatus: WorktreeGhStatusLoader;
	isIdentityCurrent: WorktreeStatusIdentityCurrentChecker;
	readFooterBranch: WorktreeStatusFooterBranchReader;
}

export interface WorktreeStatusExtensionDependencies {
	timers?: TimerScheduler | undefined;
	clock?: Clock | undefined;
	refreshIntervalMs?: number | undefined;
	loaders?: Partial<WorktreeStatusLoaders> | undefined;
}

interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	hasUI: boolean;
	abortController: AbortController;
	isClosed: boolean;
	isDormant: boolean;
	activityUnsubscribe: (() => void) | undefined;
	activityController?: WorktreeStatusActivityController;
	refreshTimer?: WorktreeStatusRefreshTimer;
	localStatus?: LocalWorktreeStatus;
	ghStatusSnapshot?: GhStatusSnapshot;
}

interface RefreshRemoteOptions extends WorktreeStatusRefreshOptions {
	readonly identity?: WorktreeStatusIdentity;
}

export default function worktreeStatusExtension(
	pi: ExtensionAPI,
	dependencies: WorktreeStatusExtensionDependencies = {},
): void {
	pi.registerMessageRenderer?.(WORKTREE_STATUS_UI_KEY, renderWorktreeStatusMessage);

	const loaders: WorktreeStatusLoaders = {
		loadIdentity: dependencies.loaders?.loadIdentity ?? loadWorktreeStatusIdentity,
		loadLocalStatus: dependencies.loaders?.loadLocalStatus ?? loadLocalWorktreeStatus,
		loadGhStatus: dependencies.loaders?.loadGhStatus ?? loadWorktreeGhStatus,
		isIdentityCurrent:
			dependencies.loaders?.isIdentityCurrent ?? isWorktreeStatusIdentityStillCurrent,
		readFooterBranch: dependencies.loaders?.readFooterBranch ?? currentFooterBranch,
	};
	const timers = dependencies.timers ?? unrefTimerScheduler;
	const clock = dependencies.clock ?? systemClock;

	let nextSessionId = 0;
	let activeSession: ActiveSession | undefined;
	let lastLinesKey: string | undefined;
	let freshnessRenderTimer: WorktreeStatusRefreshTimer | undefined;
	let requestFooterRender: (() => void) | undefined;

	function isActiveSession(session: ActiveSession): boolean {
		return (
			activeSession === session && !session.isClosed && !session.abortController.signal.aborted
		);
	}

	const fullRefreshChannel = createWorktreeStatusRefreshChannel<ActiveSession>({
		isActive: isActiveSession,
		work: refreshAllImmediately,
	});

	function activateSession(ctx: ExtensionContext): ActiveSession {
		closeActiveSession();

		const session: ActiveSession = {
			id: ++nextSessionId,
			ctx,
			cwd: ctx.cwd,
			hasUI: ctx.hasUI,
			abortController: new AbortController(),
			isClosed: false,
			isDormant: false,
			activityUnsubscribe: undefined,
		};
		activeSession = session;
		lastLinesKey = undefined;
		const controllers = createSessionControllers(session);
		session.refreshTimer = controllers.refreshTimer;
		session.activityController = controllers.activityController;
		freshnessRenderTimer = controllers.freshnessRenderTimer;
		session.activityUnsubscribe = installActivityTracking(session);
		return session;
	}

	function createSessionControllers(session: ActiveSession): {
		refreshTimer: WorktreeStatusRefreshTimer;
		activityController: WorktreeStatusActivityController;
		freshnessRenderTimer: WorktreeStatusRefreshTimer;
	} {
		const refreshTimer = createWorktreeStatusRefreshTimer({
			timers,
			clock,
			isActive: () => isActiveSession(session),
			onTick: () => refreshSession(session),
			intervalMs: dependencies.refreshIntervalMs ?? WORKTREE_STATUS_ACTIVE_REFRESH_INTERVAL_MS,
		});
		const activityController = createWorktreeStatusActivityController({
			timers,
			clock,
			isActive: () => isActiveSession(session),
			isBusy: () => isSessionBusy(session),
			onDormantChange: (isDormant) => {
				session.isDormant = isDormant;
				if (isDormant) refreshTimer.pause();
				else refreshTimer.resume();
				requestFooterRender?.();
				renderSessionStatus(session);
			},
			onWakeRefresh: () => {
				void refreshSession(session, { remoteRefresh: "cached" });
			},
		});
		const nextFreshnessRenderTimer = createWorktreeStatusRefreshTimer({
			timers,
			clock,
			isActive: () => isActiveSession(session),
			onTick: async () => {
				if (ghRefreshAgeMs(session) !== undefined) requestFooterRender?.();
			},
			intervalMs: GH_STATUS_FRESHNESS_RENDER_INTERVAL_MS,
		});
		return { refreshTimer, activityController, freshnessRenderTimer: nextFreshnessRenderTimer };
	}

	function clearFreshnessRenderTimer(): void {
		freshnessRenderTimer?.close();
		freshnessRenderTimer = undefined;
	}

	function ghRefreshAgeMs(session: ActiveSession): number | undefined {
		const localIdentity = session.localStatus?.identity;
		const snapshot = session.ghStatusSnapshot;
		if (localIdentity === undefined || snapshot === undefined) return undefined;
		if (!sameWorktreeStatusIdentity(localIdentity, snapshot.identity)) return undefined;
		return Math.max(0, clock.nowMs() - snapshot.fetchedAtMs);
	}

	function closeActiveSession(): void {
		const session = activeSession;
		if (session !== undefined) {
			session.isClosed = true;
			session.abortController.abort();
			clearFreshnessRenderTimer();
			session.refreshTimer?.close();
			session.activityController?.close();
			session.activityUnsubscribe?.();
			requestFooterRender = undefined;
			session.ctx.ui.setFooter?.(undefined);
			fullRefreshChannel.clearSession(session);
		}

		activeSession = undefined;
		shutdownGraphiteMetadataWorker();
		lastLinesKey = undefined;
	}

	function combinedSessionStatus(session: ActiveSession): WorktreeStatus | undefined {
		const localStatus = session.localStatus;
		if (localStatus === undefined) return undefined;
		const ghSnapshot = session.ghStatusSnapshot;
		if (
			ghSnapshot === undefined ||
			!sameWorktreeStatusIdentity(localStatus.identity, ghSnapshot.identity)
		) {
			return combineWorktreeStatus(localStatus, { type: "pending" });
		}
		return combineWorktreeStatus(localStatus, ghSnapshot.status);
	}

	function renderSessionStatus(session: ActiveSession): void {
		const lines = formatSessionStatusLines(session);
		if (lines.length === 0) return;

		const linesKey = JSON.stringify(lines);
		if (linesKey === lastLinesKey) return;
		if (renderSessionLines(session, lines)) lastLinesKey = linesKey;
	}

	function formatSessionStatusLines(session: ActiveSession): string[] {
		const status = combinedSessionStatus(session);
		return status === undefined
			? []
			: formatWorktreeStatus(status, {
					theme: session.ctx.ui.theme,
					...(session.isDormant ? { isDormant: true } : {}),
				});
	}

	async function refreshLocalNowWithIdentity(
		session: ActiveSession,
		identity?: WorktreeStatusIdentity,
	): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const previousIdentity = session.localStatus?.identity;
		let status = await loaders.loadLocalStatus(pi, session.cwd, {
			identity,
			signal: session.abortController.signal,
		});
		if (!isActiveSession(session)) return;

		const sharedIdentityStale =
			identity !== undefined && !loaders.isIdentityCurrent(session.cwd, identity);
		if (sharedIdentityStale) {
			status = await loaders.loadLocalStatus(pi, session.cwd, {
				signal: session.abortController.signal,
			});
			if (!isActiveSession(session)) return;
		}

		const identityChanged =
			previousIdentity !== undefined &&
			!sameWorktreeStatusIdentity(previousIdentity, status.identity);
		session.localStatus = status;
		if (identityChanged || sharedIdentityStale) delete session.ghStatusSnapshot;
		renderSessionStatus(session);
	}

	async function refreshRemoteNowWithIdentity(
		session: ActiveSession,
		options: RefreshRemoteOptions = {},
	): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const mode = remoteRefreshMode(options);
		const fetchIdentity = options.identity ?? session.localStatus?.identity;
		if (fetchIdentity === undefined) return;
		if (!shouldLoadGhStatus(session, fetchIdentity, mode)) {
			renderSessionStatus(session);
			return;
		}
		const status = await loaders.loadGhStatus(pi, session.cwd, {
			identity: fetchIdentity,
			signal: session.abortController.signal,
		});
		if (!isActiveSession(session)) return;
		const currentIdentity = session.localStatus?.identity;
		if (
			currentIdentity !== undefined &&
			!sameWorktreeStatusIdentity(currentIdentity, fetchIdentity)
		) {
			renderSessionStatus(session);
			return;
		}

		session.ghStatusSnapshot = { identity: fetchIdentity, status, fetchedAtMs: clock.nowMs() };
		renderSessionStatus(session);
	}

	function shouldLoadGhStatus(
		session: ActiveSession,
		identity: WorktreeStatusIdentity,
		mode: WorktreeStatusRemoteRefreshMode,
	): boolean {
		if (mode === "skip") return false;
		if (mode === "force") return true;
		const snapshot = session.ghStatusSnapshot;
		if (snapshot === undefined) return true;
		if (!sameWorktreeStatusIdentity(snapshot.identity, identity)) return true;
		return clock.nowMs() - snapshot.fetchedAtMs >= GH_STATUS_BACKGROUND_REFRESH_MIN_INTERVAL_MS;
	}

	async function refreshAllImmediately(
		session: ActiveSession,
		options: WorktreeStatusRefreshOptions,
	): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;
		const mode = remoteRefreshMode(options);
		if (session.isDormant && mode !== "force") return;

		const identity = await loaders.loadIdentity(pi, session.cwd, session.abortController.signal);
		if (!isActiveSession(session)) return;
		const refreshes = [refreshLocalNowWithIdentity(session, identity)];
		if (mode !== "skip") {
			refreshes.push(refreshRemoteNowWithIdentity(session, { ...options, identity }));
		}
		await Promise.all(refreshes);
		if (!isActiveSession(session)) return;

		const localIdentity = session.localStatus?.identity;
		const remoteIdentity = session.ghStatusSnapshot?.identity;
		if (
			mode !== "skip" &&
			localIdentity !== undefined &&
			(remoteIdentity === undefined || !sameWorktreeStatusIdentity(localIdentity, remoteIdentity))
		) {
			await refreshRemoteNowWithIdentity(session, { ...options, identity: localIdentity });
		}
		if (!isActiveSession(session)) return;
		session.refreshTimer?.reset();
		requestFooterRender?.();
	}

	function renderSessionLines(session: ActiveSession, lines: string[]): boolean {
		if (!isActiveSession(session) || !session.hasUI) return false;
		try {
			renderLines(session.ctx, lines);
			return true;
		} catch {
			// Session replacement can make ctx stale between the active check and render.
			return false;
		}
	}

	function installActivityTracking(session: ActiveSession): (() => void) | undefined {
		return session.ctx.ui.onTerminalInput?.(() => {
			recordSessionActivity(session);
			return undefined;
		});
	}

	function installStatusFooter(session: ActiveSession): void {
		const setFooter = session.ctx.ui.setFooter;
		if (!session.hasUI || setFooter === undefined) return;

		setFooter((tui, theme, footerData) => {
			const footerRenderRequest = () => tui.requestRender();
			requestFooterRender = footerRenderRequest;
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose() {
					unsubscribe();
					if (requestFooterRender === footerRenderRequest) requestFooterRender = undefined;
				},
				invalidate() {},
				render(width) {
					const cwd = session.ctx.sessionManager?.getCwd() ?? session.ctx.cwd;
					const branch = loaders.readFooterBranch(cwd, footerData) ?? "unknown";
					const ghRefreshAge = ghRefreshAgeMs(session);
					const worktreeStatus = combinedSessionStatus(session);
					return isActiveSession(session)
						? renderStatusFooter({
								ctx: session.ctx,
								footerData,
								theme,
								width,
								cwd,
								branch,
								fallbackRepo: fallbackRepoName(cwd),
								...(worktreeStatus === undefined ? {} : { worktreeStatus }),
								...(session.isDormant ? { isWorktreeStatusDormant: true } : {}),
								...(ghRefreshAge === undefined ? {} : { ghRefreshAgeMs: ghRefreshAge }),
							})
						: [];
				},
			};
		});
	}

	function recordActiveSessionActivity(): void {
		const session = activeSession;
		if (session === undefined) return;
		recordSessionActivity(session);
	}

	function refreshSession(
		session: ActiveSession,
		options: WorktreeStatusRefreshOptions = {},
	): Promise<void> {
		if (!isActiveSession(session)) return Promise.resolve();
		return fullRefreshChannel.run(session, options);
	}

	function refreshActiveSession(options: WorktreeStatusRefreshOptions = {}): Promise<void> {
		const session = activeSession;
		if (session === undefined) return Promise.resolve();
		return refreshSession(session, options);
	}

	function refreshActiveSessionAfterToolExecution(event: unknown): void {
		if (!shouldRefreshAfterToolExecution(event)) return;
		void refreshActiveSession();
	}

	function recordSessionActivity(
		session: ActiveSession,
		options: WorktreeStatusActivityOptions = {},
	): void {
		session.activityController?.recordActivity(options);
	}

	function isSessionBusy(session: ActiveSession): boolean {
		if (session.ctx.isIdle?.() === false) return true;
		if (session.ctx.hasPendingMessages?.() === true) return true;
		return false;
	}

	if (hasCommandRegistration(pi)) {
		registerCommandWithImmediateAck({
			host: pi,
			commandName: WORKTREE_STATUS_REFRESH_COMMAND_NAME,
			commandDefinition: {
				description: "Refresh the worktree status footer",
				handler: async (_args, _ctx) => {
					const session = activeSession;
					if (session === undefined) return;
					recordSessionActivity(session, { shouldRefreshOnWake: false });
					await refreshActiveSession({ remoteRefresh: "force" });
				},
			},
		});
	}

	function handleActiveSessionActivity(afterRecordActivity?: () => void): void {
		recordActiveSessionActivity();
		afterRecordActivity?.();
	}

	function registerWorktreeStatusActivityHandler(
		event: WorktreeStatusActivityEvent,
		afterRecordActivity?: (payload: unknown) => void,
	): void {
		pi.on(event, (payload) => {
			handleActiveSessionActivity(() => afterRecordActivity?.(payload));
		});
	}

	function registerExtensionCommandActivityHandler(): void {
		if (typeof pi.events?.on !== "function") return;
		pi.events.on(PI_EXTENSION_COMMAND_FINISHED_EVENT, () => {
			recordActiveSessionActivity();
			return refreshActiveSession({ remoteRefresh: "force" });
		});
	}

	registerWorktreeStatusActivityHandler("input");
	registerWorktreeStatusActivityHandler("user_bash");
	registerWorktreeStatusActivityHandler("agent_start");
	registerWorktreeStatusActivityHandler("agent_end");
	registerWorktreeStatusActivityHandler("turn_start");
	registerWorktreeStatusActivityHandler("turn_end", () => void refreshActiveSession());
	registerWorktreeStatusActivityHandler("message_start");
	registerWorktreeStatusActivityHandler("message_end", (payload) => {
		if (shouldRefreshAfterUserMessageEnd(payload)) {
			void refreshActiveSession({ remoteRefresh: "cached" });
		}
	});
	registerWorktreeStatusActivityHandler("tool_execution_start");
	registerWorktreeStatusActivityHandler(
		"tool_execution_end",
		refreshActiveSessionAfterToolExecution,
	);
	registerWorktreeStatusActivityHandler("model_select");
	registerWorktreeStatusActivityHandler("thinking_level_select");
	registerExtensionCommandActivityHandler();

	pi.on("session_start", async (_event, ctx) => {
		const session = activateSession(ctx);
		installStatusFooter(session);
		await refreshSession(session, { remoteRefresh: "force" });
		if (isActiveSession(session)) {
			session.refreshTimer?.resume();
			freshnessRenderTimer?.resume();
			requestFooterRender?.();
		}
	});

	pi.on("session_shutdown", async () => {
		closeActiveSession();
	});
}

function hasCommandRegistration(pi: ExtensionAPI): pi is CommandRegistrationExtensionAPI {
	return pi.registerCommand !== undefined;
}

function currentFooterBranch(cwd: string, footerData: StatusFooterData): string | null {
	const gitPaths = findWorktreeStatusGitPaths(cwd);
	if (gitPaths !== undefined) {
		const branch = currentWorktreeStatusBranchName(gitPaths);
		if (branch !== undefined) return branch;
	}
	return footerData.getGitBranch();
}

function fallbackRepoName(cwd: string): string {
	const gitPaths = findWorktreeStatusGitPaths(cwd);
	if (gitPaths !== undefined) return repoNameFromWorktreeStatusGitPaths(gitPaths) ?? "unknown";
	return basename(resolve(cwd)) || "unknown";
}

function shouldRefreshAfterUserMessageEnd(event: unknown): boolean {
	if (!isRecord(event) || !isRecord(event.message)) return false;
	return event.message.role === "user";
}

function shouldRefreshAfterToolExecution(event: unknown): boolean {
	if (!isRecord(event)) return false;
	return (
		typeof event.toolName === "string" && WORKTREE_STATUS_TOOL_REFRESH_NAMES.has(event.toolName)
	);
}

function renderLines(ctx: ExtensionContext, lines: string[]): void {
	ctx.ui.setWidget(WORKTREE_STATUS_UI_KEY, undefined);
	ctx.ui.setStatus(WORKTREE_STATUS_UI_KEY, lines.join("\n"));
}
