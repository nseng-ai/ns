import { basename, resolve } from "node:path";

import type { CustomMessageContent } from "@asdl/pi-extension-runtime/terminal-presentation";

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
	sameWorktreeStatusIdentity,
	WORKTREE_STATUS_UI_KEY,
	type ExecResult,
	type LocalWorktreeStatus,
	type StatusTheme,
	type WorktreeGhStatus,
	type WorktreeStatus,
	type WorktreeStatusIdentity,
} from "@asdl/ccc/worktree-status";
import { shutdownGraphiteMetadataWorker } from "@asdl/ccc/worktree-status/graphite-metadata";

import { isRecord } from "./cmux/primitives.ts";
import { definePiSurfaceParity } from "./parity.ts";
import {
	createWorktreeStatusActivityController,
	type WorktreeStatusActivityController,
	type WorktreeStatusActivityOptions,
} from "./worktree-status-activity.ts";
import {
	createWorktreeStatusRefreshChannel,
	type WorktreeStatusRefreshOptions,
} from "./worktree-status-refresh-channel.ts";
import {
	createWorktreeStatusRefreshTimer,
	WORKTREE_STATUS_ACTIVE_REFRESH_INTERVAL_MS,
	type WorktreeStatusRefreshTimer,
} from "./worktree-status-refresh-timer.ts";
import {
	formatWorktreeStatusDormantLine,
	renderStatusFooter,
} from "./worktree-status-footer-format.ts";

export const WORKTREE_STATUS_REFRESH_COMMAND_NAME = "pi:worktree-status-refresh";

const GH_STATUS_BACKGROUND_REFRESH_MIN_INTERVAL_MS = 15_000;

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

export const worktreeStatusParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: WORKTREE_STATUS_REFRESH_COMMAND_NAME,
		workflow: "Manually refresh the Pi worktree status footer",
		parity: "WAIVED",
		fallback:
			"Outside Pi, run the underlying Git, Graphite, GitHub, and Branch Memory fact commands directly or rely on the harness's own status surface.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "worktree-status",
		notes:
			"This command is Pi-native status UI over CCC-owned observability loaders, not a portable workflow surface.",
	},
] as const);

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

export interface ExtensionAPI {
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

export interface WorktreeStatusExtensionDependencies {
	setTimeout?: ((callback: () => void, ms: number) => ReturnType<typeof setTimeout>) | undefined;
	clearTimeout?: ((timeout: ReturnType<typeof setTimeout>) => void) | undefined;
	refreshIntervalMs?: number | undefined;
}

interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	hasUI: boolean;
	abortController: AbortController;
	closed: boolean;
	isDormant: boolean;
	activityUnsubscribe?: (() => void) | undefined;
	activityController?: WorktreeStatusActivityController | undefined;
	refreshTimer?: WorktreeStatusRefreshTimer | undefined;
	localStatus?: LocalWorktreeStatus | undefined;
	ghStatusSnapshot?: GhStatusSnapshot | undefined;
}

interface RefreshRemoteOptions extends WorktreeStatusRefreshOptions {
	readonly identity?: WorktreeStatusIdentity | undefined;
}

export default function worktreeStatusExtension(
	pi: ExtensionAPI,
	dependencies: WorktreeStatusExtensionDependencies = {},
) {
	pi.registerMessageRenderer?.(WORKTREE_STATUS_UI_KEY, renderWorktreeStatusMessage);

	let nextSessionId = 0;
	let activeSession: ActiveSession | undefined;
	let lastLinesKey: string | undefined;

	function isActiveSession(session: ActiveSession): boolean {
		return activeSession === session && !session.closed && !session.abortController.signal.aborted;
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
			closed: false,
			isDormant: false,
		};
		activeSession = session;
		lastLinesKey = undefined;
		installSessionControllers(session);
		return session;
	}

	function installSessionControllers(session: ActiveSession): void {
		session.refreshTimer = createWorktreeStatusRefreshTimer({
			dependencies: {
				setTimeout: dependencies.setTimeout ?? setTimeout,
				clearTimeout: dependencies.clearTimeout ?? clearTimeout,
			},
			isActive: () => isActiveSession(session),
			onTick: () => fullRefreshChannel.run(session),
			intervalMs: dependencies.refreshIntervalMs ?? WORKTREE_STATUS_ACTIVE_REFRESH_INTERVAL_MS,
		});
		session.activityController = createWorktreeStatusActivityController({
			dependencies: {
				setTimeout: dependencies.setTimeout ?? setTimeout,
				clearTimeout: dependencies.clearTimeout ?? clearTimeout,
				now: Date.now,
			},
			isActive: () => isActiveSession(session),
			isBusy: () => isSessionBusy(session),
			onDormantChange: (isDormant) => {
				session.isDormant = isDormant;
				if (isDormant) session.refreshTimer?.pause();
				else session.refreshTimer?.resume();
				renderSessionStatus(session);
			},
			onWakeRefresh: () => {
				void fullRefreshChannel.run(session, { shouldForceRemote: true });
			},
		});
	}

	function closeActiveSession(): void {
		const session = activeSession;
		if (session !== undefined) {
			session.closed = true;
			session.abortController.abort();
			session.refreshTimer?.close();
			session.refreshTimer = undefined;
			session.activityController?.close();
			session.activityController = undefined;
			session.activityUnsubscribe?.();
			session.activityUnsubscribe = undefined;
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
		const lines = status === undefined ? [] : formatWorktreeStatus(status, session.ctx.ui.theme);
		if (session.isDormant) lines.push(formatWorktreeStatusDormantLine(session.ctx.ui.theme));
		return lines;
	}

	async function refreshLocalNowWithIdentity(
		session: ActiveSession,
		identity?: WorktreeStatusIdentity,
	): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const previousIdentity = session.localStatus?.identity;
		let status = await loadLocalWorktreeStatus(pi, session.cwd, {
			identity,
			signal: session.abortController.signal,
		});
		if (!isActiveSession(session)) return;

		const sharedIdentityStale =
			identity !== undefined && !isWorktreeStatusIdentityStillCurrent(session.cwd, identity);
		if (sharedIdentityStale) {
			status = await loadLocalWorktreeStatus(pi, session.cwd, {
				signal: session.abortController.signal,
			});
			if (!isActiveSession(session)) return;
		}

		const identityChanged =
			previousIdentity !== undefined &&
			!sameWorktreeStatusIdentity(previousIdentity, status.identity);
		session.localStatus = status;
		if (identityChanged || sharedIdentityStale) session.ghStatusSnapshot = undefined;
		renderSessionStatus(session);
	}

	async function refreshRemoteNowWithIdentity(
		session: ActiveSession,
		options: RefreshRemoteOptions = {},
	): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const fetchIdentity = options.identity ?? session.localStatus?.identity;
		if (fetchIdentity === undefined) return;
		if (shouldUseCachedGhStatus(session, fetchIdentity, options)) {
			renderSessionStatus(session);
			return;
		}
		const status = await loadWorktreeGhStatus(pi, session.cwd, {
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

		session.ghStatusSnapshot = { identity: fetchIdentity, status, fetchedAtMs: Date.now() };
		renderSessionStatus(session);
	}

	function shouldUseCachedGhStatus(
		session: ActiveSession,
		identity: WorktreeStatusIdentity,
		options: WorktreeStatusRefreshOptions,
	): boolean {
		if (options.shouldForceRemote === true) return false;
		const snapshot = session.ghStatusSnapshot;
		if (snapshot === undefined) return false;
		if (!sameWorktreeStatusIdentity(snapshot.identity, identity)) return false;
		return Date.now() - snapshot.fetchedAtMs < GH_STATUS_BACKGROUND_REFRESH_MIN_INTERVAL_MS;
	}

	async function refreshAllImmediately(
		session: ActiveSession,
		options: WorktreeStatusRefreshOptions,
	): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;
		if (session.isDormant && options.shouldForceRemote !== true) return;

		const identity = await loadWorktreeStatusIdentity(
			pi,
			session.cwd,
			session.abortController.signal,
		);
		if (!isActiveSession(session)) return;
		await Promise.all([
			refreshLocalNowWithIdentity(session, identity),
			refreshRemoteNowWithIdentity(session, { ...options, identity }),
		]);
		if (!isActiveSession(session)) return;

		const localIdentity = session.localStatus?.identity;
		const remoteIdentity = session.ghStatusSnapshot?.identity;
		if (
			localIdentity !== undefined &&
			(remoteIdentity === undefined || !sameWorktreeStatusIdentity(localIdentity, remoteIdentity))
		) {
			await refreshRemoteNowWithIdentity(session, { ...options, identity: localIdentity });
		}
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

	function installStatusFooter(session: ActiveSession): void {
		const setFooter = session.ctx.ui.setFooter;
		if (!session.hasUI || setFooter === undefined) return;

		setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width) {
					const cwd = session.ctx.sessionManager?.getCwd() ?? session.ctx.cwd;
					const branch = currentFooterBranch(cwd, footerData) ?? "unknown";
					return isActiveSession(session)
						? renderStatusFooter({
								ctx: session.ctx,
								footerData,
								theme,
								width,
								cwd,
								branch,
								fallbackRepo: fallbackRepoName(cwd),
								worktreeStatus: combinedSessionStatus(session),
								...(session.isDormant ? { isWorktreeStatusDormant: true } : {}),
							})
						: [];
				},
			};
		});
	}

	function installActivityTracking(session: ActiveSession): void {
		const unsubscribe = session.ctx.ui.onTerminalInput?.(() => {
			recordSessionActivity(session);
			return undefined;
		});
		session.activityUnsubscribe = unsubscribe;
	}

	function recordActiveSessionActivity(): void {
		const session = activeSession;
		if (session === undefined) return;
		recordSessionActivity(session);
	}

	function refreshActiveSession(): void {
		const session = activeSession;
		if (session === undefined || !isActiveSession(session)) return;
		void fullRefreshChannel.run(session);
	}

	function refreshActiveSessionAfterToolExecution(event: unknown): void {
		if (!shouldRefreshAfterToolExecution(event)) return;
		refreshActiveSession();
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

	pi.registerCommand?.(WORKTREE_STATUS_REFRESH_COMMAND_NAME, {
		description: "Refresh the worktree status footer",
		handler: async (_args, _ctx) => {
			const session = activeSession;
			if (session === undefined) return;
			recordSessionActivity(session, { shouldRefreshOnWake: false });
			await fullRefreshChannel.run(session, { shouldForceRemote: true });
		},
	});

	function registerWorktreeStatusActivityHandler(
		event: WorktreeStatusActivityEvent,
		afterRecordActivity?: (payload: unknown) => void,
	): void {
		pi.on(event, (payload) => {
			recordActiveSessionActivity();
			afterRecordActivity?.(payload);
		});
	}

	registerWorktreeStatusActivityHandler("input");
	registerWorktreeStatusActivityHandler("user_bash");
	registerWorktreeStatusActivityHandler("agent_start");
	registerWorktreeStatusActivityHandler("agent_end");
	registerWorktreeStatusActivityHandler("turn_start");
	registerWorktreeStatusActivityHandler("turn_end", () => refreshActiveSession());
	registerWorktreeStatusActivityHandler("message_start");
	registerWorktreeStatusActivityHandler("message_end", (payload) => {
		if (shouldRefreshAfterUserMessageEnd(payload)) refreshActiveSession();
	});
	registerWorktreeStatusActivityHandler("tool_execution_start");
	registerWorktreeStatusActivityHandler(
		"tool_execution_end",
		refreshActiveSessionAfterToolExecution,
	);
	registerWorktreeStatusActivityHandler("model_select");
	registerWorktreeStatusActivityHandler("thinking_level_select");

	pi.on("session_start", async (_event, ctx) => {
		const session = activateSession(ctx);
		installStatusFooter(session);
		installActivityTracking(session);
		await fullRefreshChannel.run(session, { shouldForceRemote: true });
		if (isActiveSession(session)) session.refreshTimer?.resume();
	});

	pi.on("session_shutdown", async () => {
		closeActiveSession();
	});
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
	if (gitPaths !== undefined) return basename(gitPaths.repoDir);
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
