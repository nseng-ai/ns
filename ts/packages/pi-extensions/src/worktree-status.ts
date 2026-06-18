import { existsSync, type FSWatcher, readFileSync, readdirSync, statSync, unwatchFile, watch, watchFile } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { CustomMessageContent } from "@asdl/pi-extension-runtime/terminal-presentation";

import {
	combineWorktreeStatus,
	formatWorktreeStatus,
	loadLocalWorktreeStatus,
	loadWorktreeGhStatus,
	renderWorktreeStatusMessage,
	WORKTREE_STATUS_UI_KEY,
	type ExecGateway,
	type ExecResult,
	type LocalWorktreeStatus,
	type StatusTheme,
	type WorktreeGhStatus,
	type WorktreeStatus,
} from "@asdl/ccc/worktree-status";
import { shutdownGraphiteMetadataWorker } from "@asdl/ccc/worktree-status/graphite-metadata";

import { definePiSurfaceParity } from "./parity.ts";
import { renderStatusFooter } from "./worktree-status-footer-format.ts";

export const worktreeStatusParity = definePiSurfaceParity([] as const);

const WATCH_DEBOUNCE_MS = 500;
const WATCH_RETRY_DELAY_MS = 5_000;
const REMOTE_STATUS_REFRESH_MS = 30_000;
const MUTATING_TOOL_NAMES = new Set(["bash", "edit", "write", "multi_tool_use.parallel"]);
const IGNORED_WORKTREE_PATH_PARTS = new Set([
	".git",
	".hg",
	".svn",
	".jj",
	"node_modules",
	".venv",
	"venv",
	"__pycache__",
	".pytest_cache",
	".ruff_cache",
	".mypy_cache",
	".tox",
	".next",
	"coverage",
	"dist",
	"build",
]);

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
	};
	sessionManager?: StatusSessionManager;
	modelRegistry?: StatusModelRegistry;
	model?: StatusModel;
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

interface RenderTheme {
	fg(color: string, text: string): string;
}

interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

interface ToolResultEvent {
	toolName: string;
}

export interface ExtensionAPI {
	on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void): void;
	on(event: "tool_result", handler: (event: ToolResultEvent) => Promise<void> | void): void;
	on(event: "agent_end" | "session_shutdown", handler: () => Promise<void> | void): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
}

interface GitPaths {
	repoDir: string;
	gitDir: string;
	commonGitDir: string;
	headPath: string;
}

interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	hasUI: boolean;
	abortController: AbortController;
	closed: boolean;
	localStatus?: LocalWorktreeStatus | undefined;
	ghStatus?: WorktreeGhStatus | undefined;
}

export default function worktreeStatusExtension(pi: ExtensionAPI) {
	pi.registerMessageRenderer?.(WORKTREE_STATUS_UI_KEY, renderWorktreeStatusMessage);

	let nextSessionId = 0;
	let activeSession: ActiveSession | undefined;
	let localRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	let localRefreshInFlightSession: ActiveSession | undefined;
	let localRefreshPendingSession: ActiveSession | undefined;
	let remoteRefreshInFlightSession: ActiveSession | undefined;
	let remoteRefreshPendingSession: ActiveSession | undefined;
	let periodicRefreshTimer: ReturnType<typeof setInterval> | undefined;
	let gitWatcherRetryTimer: ReturnType<typeof setTimeout> | undefined;
	let gitWatcherRescanTimer: ReturnType<typeof setTimeout> | undefined;
	let gitWatchers: FSWatcher[] = [];
	let reftableTablesListPath: string | undefined;
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
			session.ctx.ui.setFooter?.(undefined);
			if (localRefreshInFlightSession === session) localRefreshInFlightSession = undefined;
			if (localRefreshPendingSession === session) localRefreshPendingSession = undefined;
			if (remoteRefreshInFlightSession === session) remoteRefreshInFlightSession = undefined;
			if (remoteRefreshPendingSession === session) remoteRefreshPendingSession = undefined;
		}

		activeSession = undefined;
		stopRefreshTimers();
		clearGitWatchers();
		shutdownGraphiteMetadataWorker();
		lastLinesKey = undefined;
	}

	function isActiveSession(session: ActiveSession): boolean {
		return activeSession === session && !session.closed && !session.abortController.signal.aborted;
	}

	function combinedSessionStatus(session: ActiveSession): WorktreeStatus | undefined {
		if (session.localStatus === undefined) return undefined;
		return combineWorktreeStatus(session.localStatus, session.ghStatus ?? { type: "pending" });
	}

	function renderSessionStatus(session: ActiveSession): void {
		const status = combinedSessionStatus(session);
		if (status === undefined) return;

		const lines = formatWorktreeStatus(status, session.ctx.ui.theme);
		const linesKey = JSON.stringify(lines);
		if (linesKey === lastLinesKey) return;
		if (renderSessionLines(session, lines)) lastLinesKey = linesKey;
	}

	async function refreshLocalNow(session: ActiveSession): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const status = await loadLocalWorktreeStatus(pi, session.cwd, { signal: session.abortController.signal });
		if (!isActiveSession(session)) return;

		session.localStatus = status;
		renderSessionStatus(session);
	}

	async function refreshRemoteNow(session: ActiveSession): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const status = await loadWorktreeGhStatus(pi, session.cwd, session.abortController.signal);
		if (!isActiveSession(session)) return;

		session.ghStatus = status;
		renderSessionStatus(session);
	}

	async function runLocalRefresh(session: ActiveSession): Promise<void> {
		if (!isActiveSession(session)) return;
		if (localRefreshInFlightSession === session) {
			localRefreshPendingSession = session;
			return;
		}
		if (localRefreshInFlightSession !== undefined) {
			if (isActiveSession(localRefreshInFlightSession)) {
				localRefreshPendingSession = session;
				return;
			}
			localRefreshInFlightSession = undefined;
		}

		localRefreshInFlightSession = session;
		try {
			await refreshLocalNow(session);
		} catch {
			// Background status refresh must never crash pi.
		} finally {
			if (localRefreshInFlightSession === session) localRefreshInFlightSession = undefined;
			if (localRefreshPendingSession === session) {
				localRefreshPendingSession = undefined;
				if (isActiveSession(session)) scheduleLocalRefresh(session);
			}
		}
	}

	async function runRemoteRefresh(session: ActiveSession): Promise<void> {
		if (!isActiveSession(session)) return;
		if (remoteRefreshInFlightSession === session) {
			remoteRefreshPendingSession = session;
			return;
		}
		if (remoteRefreshInFlightSession !== undefined) {
			if (isActiveSession(remoteRefreshInFlightSession)) {
				remoteRefreshPendingSession = session;
				return;
			}
			remoteRefreshInFlightSession = undefined;
		}

		remoteRefreshInFlightSession = session;
		try {
			await refreshRemoteNow(session);
		} catch {
			// Background status refresh must never crash pi.
		} finally {
			if (remoteRefreshInFlightSession === session) remoteRefreshInFlightSession = undefined;
			if (remoteRefreshPendingSession === session) {
				remoteRefreshPendingSession = undefined;
				if (isActiveSession(session)) void runRemoteRefresh(session);
			}
		}
	}

	function scheduleLocalRefresh(session: ActiveSession): void {
		if (!session.hasUI || !isActiveSession(session)) return;
		if (localRefreshTimer !== undefined) return;
		if (localRefreshInFlightSession === session) {
			localRefreshPendingSession = session;
			return;
		}

		localRefreshTimer = setTimeout(() => {
			localRefreshTimer = undefined;
			void runLocalRefresh(session);
		}, WATCH_DEBOUNCE_MS);
	}

	async function refreshAllImmediately(session: ActiveSession): Promise<void> {
		if (localRefreshTimer !== undefined) {
			clearTimeout(localRefreshTimer);
			localRefreshTimer = undefined;
		}
		await Promise.all([runLocalRefresh(session), runRemoteRefresh(session)]);
	}

	function stopRefreshTimers(): void {
		if (localRefreshTimer !== undefined) {
			clearTimeout(localRefreshTimer);
			localRefreshTimer = undefined;
		}
		if (periodicRefreshTimer !== undefined) {
			clearInterval(periodicRefreshTimer);
			periodicRefreshTimer = undefined;
		}
		localRefreshPendingSession = undefined;
		remoteRefreshPendingSession = undefined;
	}

	function startPeriodicRemoteRefresh(session: ActiveSession): void {
		if (!session.hasUI || !isActiveSession(session) || periodicRefreshTimer !== undefined) return;
		periodicRefreshTimer = setInterval(() => {
			if (!isActiveSession(session)) return;
			void runRemoteRefresh(session);
		}, REMOTE_STATUS_REFRESH_MS);
		const maybeTimer = periodicRefreshTimer as { unref?: () => void };
		maybeTimer.unref?.();
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
							})
						: [];
				},
			};
		});
	}

	function setupGitWatchers(session: ActiveSession): void {
		if (!isActiveSession(session)) return;
		clearGitWatchers();

		const gitPaths = findGitPaths(session.cwd);
		if (!gitPaths) return;

		// Match Pi's built-in footer watcher: watch the directory containing HEAD,
		// not HEAD itself. Git rewrites HEAD atomically, which can invalidate a file
		// watcher after branch switches. Also watch the worktree-local index here;
		// commits and staging commonly update it without changing HEAD.
		const gitDirPath = dirname(gitPaths.headPath);
		watchPath(session, gitDirPath, (filename) => {
			if (!filename || filename === "HEAD" || filename === "index") scheduleLocalRefresh(session);
			if (!filename || filename === "HEAD") setupGitWatchers(session);
		});

		// Packed refs live in the common git dir. In linked worktrees this differs
		// from the worktree-local git dir above.
		watchPath(session, gitPaths.commonGitDir, (filename) => {
			if (!filename || filename === "packed-refs") scheduleLocalRefresh(session);
		});

		watchCurrentBranchRef(session, gitPaths);
		watchBrmemRefs(session, gitPaths);
		watchWorktree(session, gitPaths);

		// Reftable repos update files under the reftable directory instead of HEAD.
		const reftableDir = join(gitPaths.commonGitDir, "reftable");
		if (!existsSync(reftableDir)) return;

		watchPath(session, reftableDir, () => scheduleLocalRefresh(session));

		const tablesListPath = join(reftableDir, "tables.list");
		if (!existsSync(tablesListPath)) return;

		reftableTablesListPath = tablesListPath;
		watchPath(session, tablesListPath, () => scheduleLocalRefresh(session));
		watchFile(tablesListPath, { interval: 250 }, (current, previous) => {
			if (!isActiveSession(session)) return;
			if (
				current.mtimeMs !== previous.mtimeMs ||
				current.ctimeMs !== previous.ctimeMs ||
				current.size !== previous.size
			) {
				scheduleLocalRefresh(session);
			}
		});
	}

	function watchCurrentBranchRef(session: ActiveSession, gitPaths: GitPaths): void {
		const refPath = currentBranchRefPath(gitPaths);
		if (!refPath) return;

		const refDir = dirname(refPath);
		const watchDir = nearestExistingAncestor(refDir, gitPaths.commonGitDir);
		if (!watchDir) return;

		const filenameToWatch = watchDir === refDir ? basename(refPath) : undefined;
		watchPath(session, watchDir, (filename) => {
			if (filenameToWatch && filename && filename !== filenameToWatch) return;

			scheduleLocalRefresh(session);
			if (!filenameToWatch) setupGitWatchers(session);
		});
	}

	function watchBrmemRefs(session: ActiveSession, gitPaths: GitPaths): void {
		const brmemRefsDir = join(gitPaths.commonGitDir, "refs", "brmem");
		if (existsSync(brmemRefsDir)) {
			watchDirectoryTree(session, brmemRefsDir, () => {
				scheduleLocalRefresh(session);
				scheduleGitWatcherRescan(session);
			});
			return;
		}

		const refsDir = join(gitPaths.commonGitDir, "refs");
		const watchDir = nearestExistingAncestor(brmemRefsDir, gitPaths.commonGitDir) ?? gitPaths.commonGitDir;
		const filenameToWatch = watchDir === refsDir ? "brmem" : undefined;
		watchPath(session, watchDir, (filename) => {
			if (filenameToWatch && filename && filename !== filenameToWatch) return;

			scheduleLocalRefresh(session);
			scheduleGitWatcherRescan(session);
		});
	}

	function watchWorktree(session: ActiveSession, gitPaths: GitPaths): void {
		// Git metadata catches commits/staging, but unstaged external edits only touch
		// ordinary worktree files. Watch the repo root recursively when supported and
		// filter noisy/generated paths before scheduling an expensive brmem/gt refresh.
		watchPath(
			session,
			gitPaths.repoDir,
			(filename) => {
				if (shouldIgnoreWorktreeChange(filename)) return;
				scheduleLocalRefresh(session);
			},
			{ recursive: true },
		);
	}

	function watchDirectoryTree(session: ActiveSession, root: string, onChange: () => void): void {
		for (const dir of existingDirectoryTree(root)) {
			watchPath(session, dir, onChange);
		}
	}

	function watchPath(
		session: ActiveSession,
		path: string,
		onChange: (filename?: string) => void,
		options: { recursive?: boolean } = {},
	): void {
		if (!isActiveSession(session) || !existsSync(path)) return;

		try {
			const watcher = watch(path, options, (_eventType, filename) => {
				if (!isActiveSession(session)) return;
				onChange(normalizeWatchFilename(filename));
			});
			watcher.on("error", () => handleGitWatcherError(session));
			gitWatchers.push(watcher);
		} catch {
			if (options.recursive) {
				watchPath(session, path, onChange);
				return;
			}
			scheduleGitWatcherRetry(session);
		}
	}

	function clearGitWatchers(): void {
		for (const watcher of gitWatchers) {
			try {
				watcher.close();
			} catch {
				// Ignore close races during shutdown/reload.
			}
		}
		gitWatchers = [];
		if (reftableTablesListPath !== undefined) {
			unwatchFile(reftableTablesListPath);
			reftableTablesListPath = undefined;
		}
		if (gitWatcherRetryTimer !== undefined) {
			clearTimeout(gitWatcherRetryTimer);
			gitWatcherRetryTimer = undefined;
		}
		if (gitWatcherRescanTimer !== undefined) {
			clearTimeout(gitWatcherRescanTimer);
			gitWatcherRescanTimer = undefined;
		}
	}

	function scheduleGitWatcherRetry(session: ActiveSession): void {
		if (!isActiveSession(session) || gitWatcherRetryTimer !== undefined) return;
		gitWatcherRetryTimer = setTimeout(() => {
			gitWatcherRetryTimer = undefined;
			setupGitWatchers(session);
		}, WATCH_RETRY_DELAY_MS);
	}

	function scheduleGitWatcherRescan(session: ActiveSession): void {
		if (!isActiveSession(session) || gitWatcherRescanTimer !== undefined) return;
		gitWatcherRescanTimer = setTimeout(() => {
			gitWatcherRescanTimer = undefined;
			setupGitWatchers(session);
		}, WATCH_DEBOUNCE_MS);
	}

	function handleGitWatcherError(session: ActiveSession): void {
		if (!isActiveSession(session)) return;
		clearGitWatchers();
		scheduleGitWatcherRetry(session);
	}

	pi.on("session_start", async (_event, ctx) => {
		const session = activateSession(ctx);
		installStatusFooter(session);
		setupGitWatchers(session);
		startPeriodicRemoteRefresh(session);
		await refreshAllImmediately(session);
	});

	pi.on("tool_result", async (event) => {
		const session = activeSession;
		if (session !== undefined && MUTATING_TOOL_NAMES.has(event.toolName)) {
			scheduleLocalRefresh(session);
		}
	});

	pi.on("agent_end", async () => {
		const session = activeSession;
		if (session !== undefined) await refreshAllImmediately(session);
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

function currentBranchRefPath(gitPaths: GitPaths): string | undefined {
	try {
		const head = readFileSync(gitPaths.headPath, "utf8").trim();
		const refPrefix = "ref: ";
		if (!head.startsWith(refPrefix)) return undefined;

		const refName = head.slice(refPrefix.length).trim();
		if (!refName.startsWith("refs/")) return undefined;

		return join(gitPaths.commonGitDir, refName);
	} catch {
		return undefined;
	}
}

function nearestExistingAncestor(path: string, stopAt: string): string | undefined {
	let current = path;
	for (;;) {
		if (existsSync(current)) return current;
		if (current === stopAt) return undefined;

		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function existingDirectoryTree(root: string): string[] {
	const dirs: string[] = [];
	const visit = (dir: string) => {
		dirs.push(dir);
		let entries: Array<{ isDirectory(): boolean; name: string }>;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (entry.isDirectory()) visit(join(dir, entry.name));
		}
	};

	visit(root);
	return dirs;
}

function shouldIgnoreWorktreeChange(filename: string | undefined): boolean {
	if (!filename) return false;

	const normalized = filename.replaceAll("\\", "/");
	const parts = normalized.split("/").filter((part) => part.length > 0);
	if (parts.length === 0) return false;

	return parts.some(
		(part) => IGNORED_WORKTREE_PATH_PARTS.has(part) || part.startsWith(".graphite") || part.endsWith(".swp"),
	);
}

function normalizeWatchFilename(filename: string | Buffer | null): string | undefined {
	if (filename === null) return undefined;
	return typeof filename === "string" ? filename : filename.toString();
}

