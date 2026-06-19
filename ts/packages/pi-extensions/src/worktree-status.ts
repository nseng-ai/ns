import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { CustomMessageContent } from "@asdl/pi-extension-runtime/terminal-presentation";

import {
	combineWorktreeStatus,
	formatWorktreeStatus,
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

import { definePiSurfaceParity } from "./parity.ts";
import { unrefTimer } from "./timers.ts";
import {
	formatWorktreeStatusDormantLine,
	renderStatusFooter,
} from "./worktree-status-footer-format.ts";

export const WORKTREE_STATUS_REFRESH_COMMAND_NAME = "pi:worktree-status-refresh";

const GIT_STATUS_WATCH_DEBOUNCE_MS = 100;
// Quiet window enforced after each watcher-driven refresh. Bounds the worst-case refresh
// rate to one per (refresh duration + cooldown) even if a refresh ever re-trips a watched
// path, so a feedback loop can never storm the host event loop.
const GIT_STATUS_WATCH_COOLDOWN_MS = 250;
const GH_STATUS_BACKGROUND_REFRESH_MIN_INTERVAL_MS = 15_000;
const WORKTREE_STATUS_DORMANT_AFTER_MS = 120_000;

const WORKTREE_STATUS_ACTIVITY_EVENTS = [
	"input",
	"user_bash",
	"agent_start",
	"agent_end",
	"turn_start",
	"turn_end",
	"message_start",
	"message_end",
	"tool_execution_start",
	"tool_execution_end",
	"model_select",
	"thinking_level_select",
] as const;

type WorktreeStatusActivityEvent = (typeof WORKTREE_STATUS_ACTIVITY_EVENTS)[number];

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

interface GitPaths {
	repoDir: string;
	gitDir: string;
	commonGitDir: string;
	headPath: string;
}

interface GhStatusSnapshot {
	readonly identity: WorktreeStatusIdentity;
	readonly status: WorktreeGhStatus;
	readonly fetchedAtMs: number;
}

export interface WatchHandle {
	close(): void;
}

interface WorktreeStatusWatcher {
	close(): void;
}

export interface WorktreeStatusExtensionDependencies {
	watchPath?: ((path: string, callback: () => void) => WatchHandle | undefined) | undefined;
	setTimeout?: ((callback: () => void, ms: number) => ReturnType<typeof setTimeout>) | undefined;
	clearTimeout?: ((timeout: ReturnType<typeof setTimeout>) => void) | undefined;
}

interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	hasUI: boolean;
	abortController: AbortController;
	closed: boolean;
	lastActivityAtMs: number;
	isDormant: boolean;
	activityUnsubscribe?: (() => void) | undefined;
	dormancyTimer?: ReturnType<typeof setTimeout> | undefined;
	localStatus?: LocalWorktreeStatus | undefined;
	ghStatusSnapshot?: GhStatusSnapshot | undefined;
	watcher?: WorktreeStatusWatcher | undefined;
}

interface RefreshOptions {
	readonly shouldForceRemote?: boolean;
}

interface RefreshRemoteOptions extends RefreshOptions {
	readonly identity?: WorktreeStatusIdentity | undefined;
}

interface ActivityOptions {
	readonly shouldRefreshOnWake?: boolean;
}

interface RefreshChannel {
	run(session: ActiveSession, options?: RefreshOptions): Promise<void>;
	clearSession(session: ActiveSession): void;
}

export default function worktreeStatusExtension(
	pi: ExtensionAPI,
	dependencies: WorktreeStatusExtensionDependencies = {},
) {
	pi.registerMessageRenderer?.(WORKTREE_STATUS_UI_KEY, renderWorktreeStatusMessage);

	let nextSessionId = 0;
	let activeSession: ActiveSession | undefined;
	let lastLinesKey: string | undefined;

	function activateSession(ctx: ExtensionContext): ActiveSession {
		closeActiveSession();

		const session: ActiveSession = {
			id: ++nextSessionId,
			ctx,
			cwd: ctx.cwd,
			hasUI: ctx.hasUI,
			abortController: new AbortController(),
			closed: false,
			lastActivityAtMs: Date.now(),
			isDormant: false,
		};
		activeSession = session;
		lastLinesKey = undefined;
		return session;
	}

	function closeActiveSession(): void {
		const session = activeSession;
		if (session !== undefined) {
			session.closed = true;
			session.abortController.abort();
			session.watcher?.close();
			session.watcher = undefined;
			session.activityUnsubscribe?.();
			session.activityUnsubscribe = undefined;
			clearDormancyTimer(session);
			session.ctx.ui.setFooter?.(undefined);
			fullRefreshChannel.clearSession(session);
		}

		activeSession = undefined;
		shutdownGraphiteMetadataWorker();
		lastLinesKey = undefined;
	}

	function isActiveSession(session: ActiveSession): boolean {
		return activeSession === session && !session.closed && !session.abortController.signal.aborted;
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
			identity !== undefined && !isSharedIdentityStillCurrent(session.cwd, identity);
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
		options: RefreshOptions,
	): boolean {
		if (options.shouldForceRemote === true) return false;
		const snapshot = session.ghStatusSnapshot;
		if (snapshot === undefined) return false;
		if (!sameWorktreeStatusIdentity(snapshot.identity, identity)) return false;
		return Date.now() - snapshot.fetchedAtMs < GH_STATUS_BACKGROUND_REFRESH_MIN_INTERVAL_MS;
	}

	function makeRefreshChannel(
		work: (session: ActiveSession, options: RefreshOptions) => Promise<void>,
	): RefreshChannel {
		let inFlightSession: ActiveSession | undefined;
		let inFlight: Promise<void> | undefined;
		let pendingSession: ActiveSession | undefined;
		let pendingOptions: RefreshOptions | undefined;

		function run(session: ActiveSession, options: RefreshOptions = {}): Promise<void> {
			if (!isActiveSession(session)) return Promise.resolve();
			if (inFlightSession !== undefined) {
				pendingSession = session;
				pendingOptions = combineRefreshOptions(pendingOptions, options);
				return inFlight ?? Promise.resolve();
			}

			inFlightSession = session;
			inFlight = drain(session, options);
			return inFlight;
		}

		async function drain(session: ActiveSession, options: RefreshOptions): Promise<void> {
			let nextOptions = options;
			try {
				for (;;) {
					pendingSession = undefined;
					pendingOptions = undefined;
					try {
						await work(session, nextOptions);
					} catch {
						// Background status refresh must never crash pi.
					}
					if (pendingSession !== session || !isActiveSession(session)) return;
					nextOptions = pendingOptions ?? {};
				}
			} finally {
				if (inFlightSession === session) inFlightSession = undefined;
				if (inFlightSession === undefined) inFlight = undefined;
				if (pendingSession === session) pendingSession = undefined;
			}
		}

		return {
			run,
			clearSession(session) {
				if (inFlightSession === session) inFlightSession = undefined;
				if (pendingSession === session) {
					pendingSession = undefined;
					pendingOptions = undefined;
				}
			},
		};
	}

	function combineRefreshOptions(
		left: RefreshOptions | undefined,
		right: RefreshOptions,
	): RefreshOptions {
		return left?.shouldForceRemote === true || right.shouldForceRemote === true
			? { shouldForceRemote: true }
			: {};
	}

	async function refreshAllImmediately(
		session: ActiveSession,
		options: RefreshOptions,
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

	const fullRefreshChannel = makeRefreshChannel(refreshAllImmediately);

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

	function ensureGitStatusWatcher(session: ActiveSession): void {
		if (session.watcher !== undefined || session.isDormant) return;
		session.watcher = startGitStatusWatcher(session, {
			watchPath: dependencies.watchPath ?? watchExistingPath,
			setTimeout: dependencies.setTimeout ?? setTimeout,
			clearTimeout: dependencies.clearTimeout ?? clearTimeout,
			onChange: () => fullRefreshChannel.run(session),
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

	function recordSessionActivity(session: ActiveSession, options: ActivityOptions = {}): void {
		if (!isActiveSession(session)) return;
		session.lastActivityAtMs = Date.now();
		if (session.isDormant) {
			session.isDormant = false;
			ensureGitStatusWatcher(session);
			renderSessionStatus(session);
			if (options.shouldRefreshOnWake !== false)
				void fullRefreshChannel.run(session, { shouldForceRemote: true });
		}
		scheduleDormancyCheck(session);
	}

	function scheduleDormancyCheck(session: ActiveSession): void {
		clearDormancyTimer(session);
		if (!isActiveSession(session)) return;
		const delayMs = Math.max(
			0,
			session.lastActivityAtMs + WORKTREE_STATUS_DORMANT_AFTER_MS - Date.now(),
		);
		session.dormancyTimer = (dependencies.setTimeout ?? setTimeout)(() => {
			checkSessionDormancy(session);
		}, delayMs);
		unrefTimer(session.dormancyTimer);
	}

	function clearDormancyTimer(session: ActiveSession): void {
		if (session.dormancyTimer === undefined) return;
		(dependencies.clearTimeout ?? clearTimeout)(session.dormancyTimer);
		session.dormancyTimer = undefined;
	}

	function checkSessionDormancy(session: ActiveSession): void {
		session.dormancyTimer = undefined;
		if (!isActiveSession(session)) return;
		if (isSessionBusy(session)) {
			session.lastActivityAtMs = Date.now();
			scheduleDormancyCheck(session);
			return;
		}

		const idleMs = Date.now() - session.lastActivityAtMs;
		if (idleMs < WORKTREE_STATUS_DORMANT_AFTER_MS) {
			scheduleDormancyCheck(session);
			return;
		}

		enterDormantMode(session);
	}

	function isSessionBusy(session: ActiveSession): boolean {
		try {
			if (session.ctx.isIdle?.() === false) return true;
			if (session.ctx.hasPendingMessages?.() === true) return true;
		} catch {
			return false;
		}
		return false;
	}

	function enterDormantMode(session: ActiveSession): void {
		if (!isActiveSession(session) || session.isDormant) return;
		session.isDormant = true;
		session.watcher?.close();
		session.watcher = undefined;
		renderSessionStatus(session);
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

	for (const event of WORKTREE_STATUS_ACTIVITY_EVENTS) {
		pi.on(event, () => recordActiveSessionActivity());
	}

	pi.on("session_start", async (_event, ctx) => {
		const session = activateSession(ctx);
		installStatusFooter(session);
		installActivityTracking(session);
		ensureGitStatusWatcher(session);
		scheduleDormancyCheck(session);
		await fullRefreshChannel.run(session, { shouldForceRemote: true });
	});

	pi.on("session_shutdown", async () => {
		closeActiveSession();
	});
}

function currentFooterBranch(cwd: string, footerData: StatusFooterData): string | null {
	const gitPaths = findGitPaths(cwd);
	if (gitPaths !== undefined) {
		const branch = currentBranchName(gitPaths);
		if (branch !== undefined) return branch;
	}
	return footerData.getGitBranch();
}

function fallbackRepoName(cwd: string): string {
	const gitPaths = findGitPaths(cwd);
	if (gitPaths !== undefined) return basename(gitPaths.repoDir);
	return basename(resolve(cwd)) || "unknown";
}

function renderLines(ctx: ExtensionContext, lines: string[]): void {
	ctx.ui.setWidget(WORKTREE_STATUS_UI_KEY, undefined);
	ctx.ui.setStatus(WORKTREE_STATUS_UI_KEY, lines.join("\n"));
}

interface StartGitStatusWatcherOptions {
	watchPath(path: string, callback: () => void): WatchHandle | undefined;
	setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
	onChange(): Promise<void>;
}

function startGitStatusWatcher(
	session: ActiveSession,
	options: StartGitStatusWatcherOptions,
): WorktreeStatusWatcher | undefined {
	const paths = watchedGitStatusPaths(session.cwd);
	if (paths.length === 0) return undefined;

	const handles: WatchHandle[] = [];
	let pending: ReturnType<typeof setTimeout> | undefined;
	let cooldown: ReturnType<typeof setTimeout> | undefined;
	let isRunning = false;
	let shouldRerun = false;
	let isClosed = false;

	// Watch events that arrive while a refresh is in flight, or during the cooldown that
	// follows one, collapse into a single follow-up refresh. This keeps a burst of writes
	// (e.g. `gt pr` rewriting many refs) — or any stray self-triggered event — from
	// spawning a refresh per file and saturating the host event loop.
	function flush(): void {
		pending = undefined;
		if (isClosed || !isActiveSessionForWatcher(session)) return;
		if (isRunning || cooldown !== undefined) {
			shouldRerun = true;
			return;
		}
		void runRefresh();
	}

	async function runRefresh(): Promise<void> {
		isRunning = true;
		try {
			await options.onChange();
		} finally {
			isRunning = false;
			if (!isClosed) {
				cooldown = options.setTimeout(endCooldown, GIT_STATUS_WATCH_COOLDOWN_MS);
				unrefTimer(cooldown);
			}
		}
	}

	function endCooldown(): void {
		cooldown = undefined;
		if (isClosed || !isActiveSessionForWatcher(session)) return;
		if (shouldRerun) {
			shouldRerun = false;
			void runRefresh();
		}
	}

	function schedule(): void {
		if (isClosed || pending !== undefined) return;
		pending = options.setTimeout(flush, GIT_STATUS_WATCH_DEBOUNCE_MS);
		unrefTimer(pending);
	}

	for (const path of paths) {
		const handle = options.watchPath(path, schedule);
		if (handle !== undefined) handles.push(handle);
	}

	if (handles.length === 0) return undefined;
	return {
		close() {
			isClosed = true;
			shouldRerun = false;
			if (pending !== undefined) {
				options.clearTimeout(pending);
				pending = undefined;
			}
			if (cooldown !== undefined) {
				options.clearTimeout(cooldown);
				cooldown = undefined;
			}
			for (const handle of handles) handle.close();
		},
	};
}

function isActiveSessionForWatcher(session: ActiveSession): boolean {
	return !session.closed && !session.abortController.signal.aborted;
}

function watchExistingPath(path: string, callback: () => void): WatchHandle | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const watcher = watch(path, { persistent: false }, callback);
		watcher.on("error", () => watcher.close());
		return watcher;
	} catch {
		// File watching is best-effort: path races or permission failures should not block status rendering.
		return undefined;
	}
}

// Only watch paths that signal a commit or ref update *and* are never written by
// our own status refresh. `git status` (run on every refresh) rewrites `.git/index`,
// and `logs/*` churn on every git operation; watching either turns the refresh into a
// self-triggering feedback loop that storms the host event loop. HEAD and the current
// branch ref capture checkpoint commits and ref updates without that hazard.
function watchedGitStatusPaths(cwd: string): string[] {
	const gitPaths = findGitPaths(cwd);
	if (gitPaths === undefined) return [];

	const paths = new Set<string>([gitPaths.headPath, join(gitPaths.commonGitDir, "packed-refs")]);
	const currentBranch = currentBranchName(gitPaths);
	if (currentBranch !== undefined) {
		const refPath = join(gitPaths.commonGitDir, "refs", "heads", ...currentBranch.split("/"));
		paths.add(refPath);
		// Watch the containing directory too: a ref update writes the ref via temp-file
		// rename, which can detach a file-level watch after the first commit.
		paths.add(dirname(refPath));
	}

	return [...paths].filter((path) => existsSync(path));
}

function findGitPaths(cwd: string): GitPaths | undefined {
	let dir = resolve(cwd);
	for (;;) {
		const gitPath = join(dir, ".git");
		if (existsSync(gitPath)) {
			try {
				const stat = statSync(gitPath);
				if (stat.isFile()) {
					const content = readFileSync(gitPath, "utf8").trim();
					if (content.startsWith("gitdir: ")) {
						const gitDir = resolve(dir, content.slice(8).trim());
						const headPath = join(gitDir, "HEAD");
						if (!existsSync(headPath)) return undefined;

						const commonDirPath = join(gitDir, "commondir");
						const commonGitDir = existsSync(commonDirPath)
							? resolve(gitDir, readFileSync(commonDirPath, "utf8").trim())
							: gitDir;
						return { repoDir: dir, gitDir, commonGitDir, headPath };
					}
				} else if (stat.isDirectory()) {
					const headPath = join(gitPath, "HEAD");
					if (!existsSync(headPath)) return undefined;
					return { repoDir: dir, gitDir: gitPath, commonGitDir: gitPath, headPath };
				}
			} catch {
				return undefined;
			}
		}

		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
}

function currentBranchName(gitPaths: GitPaths): string | undefined {
	try {
		const head = readFileSync(gitPaths.headPath, "utf8").trim();
		const refPrefix = "ref: refs/heads/";
		if (!head.startsWith(refPrefix)) return undefined;

		const branch = head.slice(refPrefix.length).trim();
		return branch.length > 0 ? branch : undefined;
	} catch {
		return undefined;
	}
}

function isSharedIdentityStillCurrent(cwd: string, identity: WorktreeStatusIdentity): boolean {
	const gitPaths = findGitPaths(cwd);
	if (gitPaths === undefined) return identity.head.type === "unknown";
	const currentBranch = currentBranchName(gitPaths);
	if (identity.head.type !== "branch") return currentBranch === undefined;
	if (currentBranch !== identity.head.name) return false;

	const currentOid = currentBranchLooseOid(gitPaths, identity.head.name);
	return (
		currentOid === undefined || identity.headOid === undefined || currentOid === identity.headOid
	);
}

function currentBranchLooseOid(gitPaths: GitPaths, branch: string): string | undefined {
	const refPath = join(gitPaths.commonGitDir, "refs", "heads", ...branch.split("/"));
	if (!existsSync(refPath)) return undefined;
	try {
		const oid = readFileSync(refPath, "utf8").trim();
		return oid.length > 0 ? oid : undefined;
	} catch {
		return undefined;
	}
}
