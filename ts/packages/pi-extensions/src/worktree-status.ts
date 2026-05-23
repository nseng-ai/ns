import { existsSync, type FSWatcher, readFileSync, readdirSync, statSync, unwatchFile, watch, watchFile } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const UI_KEY = "worktree-status";
const LOCAL_BRANCH_REF_PREFIX = "refs/heads/";
const COMMAND_TIMEOUT_MS = 5_000;
const WATCH_DEBOUNCE_MS = 500;
const WATCH_RETRY_DELAY_MS = 5_000;
const EXCLUDED_BRMEM_NAMESPACES = new Set(["objectives-archive"]);
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

export type NotifyLevel = "info" | "success" | "warning" | "error";

export type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed?: boolean;
};

type ExecOptions = {
	cwd?: string;
	timeout?: number;
	signal?: AbortSignal;
};

type AutocompleteItem = {
	value: string;
	label?: string;
	description?: string;
};

type StatusWidget = (
	tui: unknown,
	theme: { fg(color: "dim", value: string): string },
) => {
	render(width: number): string[];
	invalidate(): void;
};

export type ExtensionContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus(key: string, value: string | undefined): void;
		setWidget(key: string, value: StatusWidget | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void;
	};
};

type CustomMessage = {
	customType: string;
	content: string;
	display: boolean;
};

type ToolResultEvent = {
	toolName: string;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: ExtensionContext): Promise<void> | void;
		},
	): void;
	on(event: "session_start", handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void): void;
	on(event: "tool_result", handler: (event: ToolResultEvent) => Promise<void> | void): void;
	on(event: "agent_end" | "session_shutdown", handler: () => Promise<void> | void): void;
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
	sendMessage?(message: CustomMessage): void;
};

type ExecGateway = Pick<ExtensionAPI, "exec">;

type BrmemEntry = {
	namespace: string | null;
	key: string;
};

type BrmemListEnvelope = {
	exit_code?: number;
	data?: {
		entries?: BrmemEntry[];
	};
};

type BrmemCommandCandidate = {
	command: string;
	prefixArgs: string[];
};

type GitPaths = {
	repoDir: string;
	gitDir: string;
	commonGitDir: string;
	headPath: string;
};

export type GtStatus = {
	down: string;
	up: string;
	commits: "yes" | "no" | "?";
	dirty: "yes" | "no";
};

export type WorktreeStatus = {
	brmem: string | undefined;
	gt: GtStatus;
};

type ActiveSession = {
	id: number;
	ctx: ExtensionContext;
	cwd: string;
	hasUI: boolean;
	abortController: AbortController;
	closed: boolean;
};

export default function worktreeStatusExtension(pi: ExtensionAPI) {
	let nextSessionId = 0;
	let activeSession: ActiveSession | undefined;
	let refreshSequence = 0;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	let refreshInFlightSession: ActiveSession | undefined;
	let refreshPendingSession: ActiveSession | undefined;
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
			if (refreshInFlightSession === session) refreshInFlightSession = undefined;
			if (refreshPendingSession === session) refreshPendingSession = undefined;
		}

		activeSession = undefined;
		refreshSequence++;
		stopRefreshTimers();
		clearGitWatchers();
		lastLinesKey = undefined;
	}

	function isActiveSession(session: ActiveSession): boolean {
		return activeSession === session && !session.closed && !session.abortController.signal.aborted;
	}

	async function refreshNow(session: ActiveSession): Promise<void> {
		if (!session.hasUI || !isActiveSession(session)) return;

		const sequence = ++refreshSequence;
		const status = await loadWorktreeStatus(pi, session.cwd, session.abortController.signal);
		if (sequence !== refreshSequence || !isActiveSession(session)) return;

		const lines = formatWorktreeStatus(status);
		const linesKey = JSON.stringify(lines);
		if (linesKey === lastLinesKey) return;
		if (renderSessionLines(session, lines)) lastLinesKey = linesKey;
	}

	async function runRefresh(session: ActiveSession): Promise<void> {
		if (!isActiveSession(session)) return;
		if (refreshInFlightSession === session) {
			refreshPendingSession = session;
			return;
		}
		if (refreshInFlightSession !== undefined) {
			if (isActiveSession(refreshInFlightSession)) {
				refreshPendingSession = session;
				return;
			}
			refreshInFlightSession = undefined;
		}

		refreshInFlightSession = session;
		try {
			await refreshNow(session);
		} catch {
			// Background status refresh must never crash pi.
		} finally {
			if (refreshInFlightSession === session) refreshInFlightSession = undefined;
			if (refreshPendingSession === session) {
				refreshPendingSession = undefined;
				if (isActiveSession(session)) scheduleRefresh(session);
			}
		}
	}

	function scheduleRefresh(session: ActiveSession): void {
		if (!session.hasUI || !isActiveSession(session)) return;
		if (refreshTimer !== undefined) return;
		if (refreshInFlightSession === session) {
			refreshPendingSession = session;
			return;
		}

		refreshTimer = setTimeout(() => {
			refreshTimer = undefined;
			void runRefresh(session);
		}, WATCH_DEBOUNCE_MS);
	}

	async function refreshImmediately(session: ActiveSession): Promise<void> {
		if (refreshTimer !== undefined) {
			clearTimeout(refreshTimer);
			refreshTimer = undefined;
		}
		await runRefresh(session);
	}

	function stopRefreshTimers(): void {
		if (refreshTimer !== undefined) {
			clearTimeout(refreshTimer);
			refreshTimer = undefined;
		}
		refreshPendingSession = undefined;
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
			if (!filename || filename === "HEAD" || filename === "index") scheduleRefresh(session);
			if (!filename || filename === "HEAD") setupGitWatchers(session);
		});

		// Packed refs live in the common git dir. In linked worktrees this differs
		// from the worktree-local git dir above.
		watchPath(session, gitPaths.commonGitDir, (filename) => {
			if (!filename || filename === "packed-refs") scheduleRefresh(session);
		});

		watchCurrentBranchRef(session, gitPaths);
		watchBrmemRefs(session, gitPaths);
		watchWorktree(session, gitPaths);

		// Reftable repos update files under the reftable directory instead of HEAD.
		const reftableDir = join(gitPaths.commonGitDir, "reftable");
		if (!existsSync(reftableDir)) return;

		watchPath(session, reftableDir, () => scheduleRefresh(session));

		const tablesListPath = join(reftableDir, "tables.list");
		if (!existsSync(tablesListPath)) return;

		reftableTablesListPath = tablesListPath;
		watchPath(session, tablesListPath, () => scheduleRefresh(session));
		watchFile(tablesListPath, { interval: 250 }, (current, previous) => {
			if (!isActiveSession(session)) return;
			if (
				current.mtimeMs !== previous.mtimeMs ||
				current.ctimeMs !== previous.ctimeMs ||
				current.size !== previous.size
			) {
				scheduleRefresh(session);
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

			scheduleRefresh(session);
			if (!filenameToWatch) setupGitWatchers(session);
		});
	}

	function watchBrmemRefs(session: ActiveSession, gitPaths: GitPaths): void {
		const brmemRefsDir = join(gitPaths.commonGitDir, "refs", "brmem");
		if (existsSync(brmemRefsDir)) {
			watchDirectoryTree(session, brmemRefsDir, () => {
				scheduleRefresh(session);
				scheduleGitWatcherRescan(session);
			});
			return;
		}

		const refsDir = join(gitPaths.commonGitDir, "refs");
		const watchDir = nearestExistingAncestor(brmemRefsDir, gitPaths.commonGitDir) ?? gitPaths.commonGitDir;
		const filenameToWatch = watchDir === refsDir ? "brmem" : undefined;
		watchPath(session, watchDir, (filename) => {
			if (filenameToWatch && filename && filename !== filenameToWatch) return;

			scheduleRefresh(session);
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
				scheduleRefresh(session);
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

	async function showStatus(ctx: ExtensionContext): Promise<void> {
		const cwd = ctx.cwd;
		const status = await loadWorktreeStatus(pi, cwd);
		const lines = formatWorktreeStatus(status);
		try {
			renderLines(ctx, lines);
			lastLinesKey = JSON.stringify(lines);
			pi.sendMessage?.({ customType: "worktree-status", content: lines.join("\n"), display: true });
		} catch {
			// Ignore command-display races during session replacement/reload.
		}
	}

	pi.registerCommand("worktree-status", {
		description: "Refresh and show brmem and Graphite worktree status",
		handler: async (argsText, ctx) => {
			if (argsText.trim().length > 0) {
				const message = "Usage: /worktree-status";
				pi.sendMessage?.({ customType: "worktree-status", content: message, display: true });
				if (ctx.hasUI) ctx.ui.notify(message, "error");
				return;
			}
			await showStatus(ctx);
		},
	});

	pi.registerCommand("brmem-status", {
		description: "Refresh and show brmem and Graphite worktree status",
		handler: async (_argsText, ctx) => {
			await showStatus(ctx);
		},
	});

	pi.registerCommand("gt-status", {
		description: "Refresh and show brmem and Graphite worktree status",
		handler: async (_argsText, ctx) => {
			await showStatus(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const session = activateSession(ctx);
		setupGitWatchers(session);
		await refreshImmediately(session);
	});

	pi.on("tool_result", async (event) => {
		const session = activeSession;
		if (session !== undefined && MUTATING_TOOL_NAMES.has(event.toolName)) {
			scheduleRefresh(session);
		}
	});

	pi.on("agent_end", async () => {
		const session = activeSession;
		if (session !== undefined) await refreshImmediately(session);
	});

	pi.on("session_shutdown", async () => {
		closeActiveSession();
	});
}

export async function loadWorktreeStatus(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<WorktreeStatus> {
	const [brmem, gt] = await Promise.all([loadBrmemStatus(pi, cwd, signal), loadGtStatus(pi, cwd, signal)]);

	return { brmem, gt };
}

export async function loadGtStatus(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<GtStatus> {
	const down = await loadDownBranch(pi, cwd, signal);
	const [up, commits, dirty] = await Promise.all([
		loadUpBranch(pi, cwd, signal),
		loadHasCommits(pi, cwd, down, signal),
		loadDirty(pi, cwd, signal),
	]);

	return { down, up, commits, dirty };
}

async function loadBrmemStatus(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<string | undefined> {
	for (const candidate of resolveBrmemCommandCandidates(cwd)) {
		if (signal?.aborted) return undefined;

		try {
			const result = await pi.exec(
				candidate.command,
				[...candidate.prefixArgs, "list", "--format", "json"],
				execOptions(cwd, signal),
			);

			if (result.code !== 0) continue;

			const parsed = JSON.parse(result.stdout) as BrmemListEnvelope;
			const entries = parsed.data?.entries ?? [];
			const status = formatBrmemScopes(entries);
			return status.length > 0 ? status : undefined;
		} catch {
			// Try the next brmem CLI candidate.
		}
	}

	return signal?.aborted ? undefined : "unavailable";
}

function formatBrmemScopes(entries: BrmemEntry[]): string {
	const namespaces: Array<{ name: string; keys: string[]; seenKeys: Set<string> }> = [];
	const seenNamespaces = new Map<string, { name: string; keys: string[]; seenKeys: Set<string> }>();

	for (const entry of entries) {
		const scope = scopeFromEntry(entry);
		if (!scope) continue;

		let namespace = seenNamespaces.get(scope.namespace);
		if (!namespace) {
			namespace = { name: scope.namespace, keys: [], seenKeys: new Set<string>() };
			seenNamespaces.set(scope.namespace, namespace);
			namespaces.push(namespace);
		}

		if (!namespace.seenKeys.has(scope.key)) {
			namespace.seenKeys.add(scope.key);
			namespace.keys.push(scope.key);
		}
	}

	return namespaces
		.filter((namespace) => namespace.keys.length > 0)
		.map((namespace) => `(${namespace.name}: ${namespace.keys.join(", ")})`)
		.join(" ");
}

function scopeFromEntry(entry: BrmemEntry): { namespace: string; key: string } | undefined {
	const keyParts = entry.key.split("/").filter((part) => part.length > 0);
	if (entry.namespace !== null) {
		if (EXCLUDED_BRMEM_NAMESPACES.has(entry.namespace)) return undefined;

		const topLevelKey = keyParts[0] ?? entry.key;
		return topLevelKey.length > 0 ? { namespace: entry.namespace, key: topLevelKey } : undefined;
	}

	const namespace = keyParts[0];
	if (!namespace || EXCLUDED_BRMEM_NAMESPACES.has(namespace)) return undefined;

	const topLevelKey = keyParts[1] ?? entry.key;
	return topLevelKey ? { namespace, key: topLevelKey } : undefined;
}

async function loadDownBranch(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<string> {
	if (signal?.aborted) return "-";

	try {
		const result = await pi.exec("gt", ["parent"], execOptions(cwd, signal));
		if (result.code === 0) {
			const parent = firstNonEmptyLine(result.stdout);
			if (parent) return parent;
		}
	} catch {
		// Fall back to the previously checked-out local branch when Graphite is unavailable.
	}

	return (await loadPreviousCheckoutLocalBranch(pi, cwd, signal)) ?? "-";
}

async function loadPreviousCheckoutLocalBranch(
	pi: ExecGateway,
	cwd: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	if (signal?.aborted) return undefined;

	try {
		const previousRefResult = await pi.exec("git", ["rev-parse", "--symbolic-full-name", "@{-1}"], execOptions(cwd, signal));
		if (previousRefResult.code !== 0) return undefined;

		const previousRef = firstNonEmptyLine(previousRefResult.stdout);
		if (!previousRef?.startsWith(LOCAL_BRANCH_REF_PREFIX)) return undefined;

		const verifyResult = await pi.exec("git", ["show-ref", "--verify", previousRef], execOptions(cwd, signal));
		if (verifyResult.code !== 0) return undefined;

		const branch = previousRef.slice(LOCAL_BRANCH_REF_PREFIX.length);
		return branch.length > 0 ? branch : undefined;
	} catch {
		return undefined;
	}
}

async function loadUpBranch(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<string> {
	if (signal?.aborted) return "-";

	try {
		const result = await pi.exec("gt", ["children"], execOptions(cwd, signal));
		if (result.code !== 0) return "-";

		const children = nonEmptyLines(result.stdout);
		if (children.length === 0) return "-";
		if (children.length === 1) return children[0] ?? "-";
		return "<multiple>";
	} catch {
		return "-";
	}
}

async function loadHasCommits(
	pi: ExecGateway,
	cwd: string,
	down: string,
	signal?: AbortSignal,
): Promise<"yes" | "no" | "?"> {
	if (down === "-" || signal?.aborted) return "?";

	try {
		const result = await pi.exec("git", ["rev-list", "--count", `${down}..HEAD`], execOptions(cwd, signal));
		if (result.code !== 0) return "?";

		const count = Number.parseInt(result.stdout.trim(), 10);
		if (!Number.isFinite(count)) return "?";
		return count > 0 ? "yes" : "no";
	} catch {
		return "?";
	}
}

async function loadDirty(pi: ExecGateway, cwd: string, signal?: AbortSignal): Promise<"yes" | "no"> {
	if (signal?.aborted) return "no";

	try {
		const result = await pi.exec("git", ["status", "--porcelain=v1"], execOptions(cwd, signal));
		return result.stdout.trim().length > 0 ? "yes" : "no";
	} catch {
		return "no";
	}
}

function execOptions(cwd: string, signal?: AbortSignal) {
	return signal === undefined
		? { cwd, timeout: COMMAND_TIMEOUT_MS }
		: { cwd, signal, timeout: COMMAND_TIMEOUT_MS };
}

export function formatWorktreeStatus(status: WorktreeStatus): string[] {
	const lines: string[] = [];
	if (status.brmem !== undefined) {
		lines.push(`[brmem] ${status.brmem}`);
	}
	lines.push(formatGtStatus(status.gt));
	return lines;
}

export function formatGtStatus(status: GtStatus): string {
	const commits = status.commits === "yes" ? " (commits)" : status.commits === "?" ? " (commits: ?)" : "";
	const dirty = status.dirty === "yes" ? " (x)" : "";
	return `[gt] (↓: ${status.down}) (↑: ${status.up})${commits}${dirty}`;
}

function renderLines(ctx: ExtensionContext, lines: string[]): void {
	ctx.ui.setStatus(UI_KEY, undefined);
	ctx.ui.setWidget(UI_KEY, dimLinesWidget(lines), { placement: "belowEditor" });
}

function dimLinesWidget(lines: string[]): StatusWidget {
	return (_tui, theme) => ({
		render: (width: number) => lines.map((line) => theme.fg("dim", truncateToWidth(line, width, "…"))),
		invalidate: () => {},
	});
}

function truncateToWidth(value: string, width: number, ellipsis: string): string {
	if (width <= 0) return "";
	const characters = Array.from(value);
	if (characters.length <= width) return value;

	const ellipsisCharacters = Array.from(ellipsis);
	if (width <= ellipsisCharacters.length) return ellipsisCharacters.slice(0, width).join("");

	return `${characters.slice(0, width - ellipsisCharacters.length).join("")}${ellipsis}`;
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

function findAncestorContaining(startDir: string, relativePath: string): string | undefined {
	let current = resolve(startDir);
	for (;;) {
		if (existsSync(join(current, relativePath))) {
			return current;
		}
		const parent = dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
}

function resolveBrmemCommandCandidates(cwd: string): BrmemCommandCandidate[] {
	const candidates: BrmemCommandCandidate[] = [];
	const seen = new Set<string>();

	const add = (candidate: BrmemCommandCandidate) => {
		const key = JSON.stringify(candidate);
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push(candidate);
		}
	};

	const venvRoot = findAncestorContaining(cwd, join(".venv", "bin", "brmem"));
	if (venvRoot) {
		add({ command: join(venvRoot, ".venv", "bin", "brmem"), prefixArgs: [] });
	}

	add({ command: "brmem", prefixArgs: [] });

	const projectRoot = findAncestorContaining(cwd, "pyproject.toml");
	if (projectRoot) {
		add({ command: "uv", prefixArgs: ["run", "--directory", projectRoot, "brmem"] });
	}

	return candidates;
}

function firstNonEmptyLine(value: string): string | undefined {
	return nonEmptyLines(value)[0];
}

function nonEmptyLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}
