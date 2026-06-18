import { existsSync, readFileSync, statSync } from "node:fs";
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
import { renderStatusFooter } from "./worktree-status-footer-format.ts";

export const WORKTREE_STATUS_REFRESH_COMMAND_NAME = "pi:worktree-status-refresh";

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
		notes: "This command is Pi-native status UI over CCC-owned observability loaders, not a portable workflow surface.",
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

interface RegisteredCommand {
	description: string;
	handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
}

export interface ExtensionAPI {
	on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void): void;
	on(event: "session_shutdown", handler: () => Promise<void> | void): void;
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

interface ActiveSession {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	hasUI: boolean;
	abortController: AbortController;
	closed: boolean;
	localStatus?: LocalWorktreeStatus | undefined;
	ghStatusSnapshot?: GhStatusSnapshot | undefined;
}

interface RefreshChannel {
	run(session: ActiveSession): Promise<void>;
	clearSession(session: ActiveSession): void;
}

export default function worktreeStatusExtension(pi: ExtensionAPI) {
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
		if (ghSnapshot === undefined || !sameWorktreeStatusIdentity(localStatus.identity, ghSnapshot.identity)) {
			return combineWorktreeStatus(localStatus, { type: "pending" });
		}
		return combineWorktreeStatus(localStatus, ghSnapshot.status);
	}

	function renderSessionStatus(session: ActiveSession): void {
		const status = combinedSessionStatus(session);
		if (status === undefined) return;

		const lines = formatWorktreeStatus(status, session.ctx.ui.theme);
		const linesKey = JSON.stringify(lines);
		if (linesKey === lastLinesKey) return;
		if (renderSessionLines(session, lines)) lastLinesKey = linesKey;
	}

	async function refreshLocalNowWithIdentity(session: ActiveSession, identity?: WorktreeStatusIdentity): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const previousIdentity = session.localStatus?.identity;
		let status = await loadLocalWorktreeStatus(pi, session.cwd, { identity, signal: session.abortController.signal });
		if (!isActiveSession(session)) return;

		const sharedIdentityStale = identity !== undefined && !isSharedIdentityStillCurrent(session.cwd, identity);
		if (sharedIdentityStale) {
			status = await loadLocalWorktreeStatus(pi, session.cwd, { signal: session.abortController.signal });
			if (!isActiveSession(session)) return;
		}

		const identityChanged = previousIdentity !== undefined && !sameWorktreeStatusIdentity(previousIdentity, status.identity);
		session.localStatus = status;
		if (identityChanged || sharedIdentityStale) session.ghStatusSnapshot = undefined;
		renderSessionStatus(session);
	}

	async function refreshRemoteNowWithIdentity(session: ActiveSession, identity?: WorktreeStatusIdentity): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const fetchIdentity = identity ?? session.localStatus?.identity;
		if (fetchIdentity === undefined) return;
		const status = await loadWorktreeGhStatus(pi, session.cwd, { identity: fetchIdentity, signal: session.abortController.signal });
		if (!isActiveSession(session)) return;
		const currentIdentity = session.localStatus?.identity;
		if (currentIdentity !== undefined && !sameWorktreeStatusIdentity(currentIdentity, fetchIdentity)) {
			renderSessionStatus(session);
			return;
		}

		session.ghStatusSnapshot = { identity: fetchIdentity, status, fetchedAtMs: Date.now() };
		renderSessionStatus(session);
	}

	function makeRefreshChannel(work: (session: ActiveSession) => Promise<void>): RefreshChannel {
		let inFlightSession: ActiveSession | undefined;
		let inFlight: Promise<void> | undefined;
		let pendingSession: ActiveSession | undefined;

		function run(session: ActiveSession): Promise<void> {
			if (!isActiveSession(session)) return Promise.resolve();
			if (inFlightSession !== undefined) {
				pendingSession = session;
				return inFlight ?? Promise.resolve();
			}

			inFlightSession = session;
			inFlight = drain(session);
			return inFlight;
		}

		async function drain(session: ActiveSession): Promise<void> {
			try {
				for (;;) {
					pendingSession = undefined;
					try {
						await work(session);
					} catch {
						// Background status refresh must never crash pi.
					}
					if (pendingSession !== session || !isActiveSession(session)) return;
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
				if (pendingSession === session) pendingSession = undefined;
			},
		};
	}

	async function refreshAllImmediately(session: ActiveSession): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const identity = await loadWorktreeStatusIdentity(pi, session.cwd, session.abortController.signal);
		if (!isActiveSession(session)) return;
		await Promise.all([refreshLocalNowWithIdentity(session, identity), refreshRemoteNowWithIdentity(session, identity)]);
		if (!isActiveSession(session)) return;

		const localIdentity = session.localStatus?.identity;
		const remoteIdentity = session.ghStatusSnapshot?.identity;
		if (localIdentity !== undefined && (remoteIdentity === undefined || !sameWorktreeStatusIdentity(localIdentity, remoteIdentity))) {
			await refreshRemoteNowWithIdentity(session, localIdentity);
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
							})
						: [];
				},
			};
		});
	}

	pi.registerCommand?.(WORKTREE_STATUS_REFRESH_COMMAND_NAME, {
		description: "Refresh the worktree status footer",
		handler: async (_args, _ctx) => {
			const session = activeSession;
			if (session === undefined) return;
			await fullRefreshChannel.run(session);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const session = activateSession(ctx);
		installStatusFooter(session);
		await fullRefreshChannel.run(session);
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

function isSharedIdentityStillCurrent(cwd: string, identity: WorktreeStatusIdentity): boolean {
	const gitPaths = findGitPaths(cwd);
	if (gitPaths === undefined) return identity.head.type === "unknown";
	const currentBranch = currentBranchName(gitPaths);
	if (identity.head.type !== "branch") return currentBranch === undefined;
	if (currentBranch !== identity.head.name) return false;

	const currentOid = currentBranchLooseOid(gitPaths, identity.head.name);
	return currentOid === undefined || identity.headOid === undefined || currentOid === identity.headOid;
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


