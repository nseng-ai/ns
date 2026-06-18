import { existsSync, readFileSync, statSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { WorktreeStatusIdentity } from "@asdl/ccc/worktree-status";

import { unrefTimer } from "./timers.ts";

export const GIT_STATUS_WATCH_DEBOUNCE_MS = 100;
// Quiet window enforced after each watcher-driven refresh. Bounds the worst-case refresh
// rate to one per (refresh duration + cooldown) even if a refresh ever re-trips a watched
// path, so a feedback loop can never storm the host event loop.
export const GIT_STATUS_WATCH_COOLDOWN_MS = 250;

export interface GitPaths {
	repoDir: string;
	gitDir: string;
	commonGitDir: string;
	headPath: string;
}

export interface WatchHandle {
	close(): void;
}

export interface WorktreeStatusWatchDependencies {
	watchPath(path: string, callback: () => void): WatchHandle | undefined;
	setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimeout(timeout: ReturnType<typeof setTimeout>): void;
}

export interface WorktreeStatusGitWatcher {
	update(identity: WorktreeStatusIdentity | undefined): void;
	pause(): void;
	resume(identity: WorktreeStatusIdentity | undefined): void;
	close(): void;
}

export function createWorktreeStatusGitWatcher(options: {
	cwd: string;
	dependencies: WorktreeStatusWatchDependencies;
	isActive(): boolean;
	onChange(): Promise<void>;
}): WorktreeStatusGitWatcher {
	let latestIdentity: WorktreeStatusIdentity | undefined;
	let currentPlanKey: string | undefined;
	let handles: WatchHandle[] = [];
	let pending: ReturnType<typeof setTimeout> | undefined;
	let cooldown: ReturnType<typeof setTimeout> | undefined;
	let isRunning = false;
	let shouldRerun = false;
	let isClosed = false;
	let isPaused = false;

	function update(identity: WorktreeStatusIdentity | undefined): void {
		latestIdentity = identity;
		if (isClosed || isPaused || !options.isActive()) return;

		const paths = planWorktreeStatusGitWatchPaths({ cwd: options.cwd, identity });
		const nextPlanKey = pathSetKey(paths);
		if (nextPlanKey === currentPlanKey) return;

		closeHandles();
		currentPlanKey = nextPlanKey;
		for (const path of paths) {
			const handle = options.dependencies.watchPath(path, schedule);
			if (handle !== undefined) handles.push(handle);
		}
	}

	function pause(): void {
		if (isClosed || isPaused) return;
		isPaused = true;
		shouldRerun = false;
		clearPendingTimers();
		closeHandles();
	}

	function resume(identity: WorktreeStatusIdentity | undefined): void {
		if (isClosed) return;
		isPaused = false;
		currentPlanKey = undefined;
		update(identity ?? latestIdentity);
	}

	function close(): void {
		isClosed = true;
		isPaused = true;
		shouldRerun = false;
		clearPendingTimers();
		closeHandles();
	}

	function closeHandles(): void {
		for (const handle of handles) handle.close();
		handles = [];
	}

	function clearPendingTimers(): void {
		if (pending !== undefined) {
			options.dependencies.clearTimeout(pending);
			pending = undefined;
		}
		if (cooldown !== undefined) {
			options.dependencies.clearTimeout(cooldown);
			cooldown = undefined;
		}
	}

	// Watch events that arrive while a refresh is in flight, or during the cooldown that
	// follows one, collapse into a single follow-up refresh. This keeps a burst of writes
	// (e.g. `gt pr` rewriting many refs) — or a stray self-triggered event — from
	// spawning a refresh per file and saturating the host event loop.
	function flush(): void {
		pending = undefined;
		if (isClosed || isPaused || !options.isActive()) return;
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
			if (!isClosed && !isPaused) {
				cooldown = options.dependencies.setTimeout(endCooldown, GIT_STATUS_WATCH_COOLDOWN_MS);
				unrefTimer(cooldown);
			}
		}
	}

	function endCooldown(): void {
		cooldown = undefined;
		if (isClosed || isPaused || !options.isActive()) return;
		if (shouldRerun) {
			shouldRerun = false;
			void runRefresh();
		}
	}

	function schedule(): void {
		if (isClosed || isPaused || pending !== undefined) return;
		pending = options.dependencies.setTimeout(flush, GIT_STATUS_WATCH_DEBOUNCE_MS);
		unrefTimer(pending);
	}

	return { update, pause, resume, close };
}

export function watchExistingPath(path: string, callback: () => void): WatchHandle | undefined {
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

export function planWorktreeStatusGitWatchPaths(options: {
	readonly cwd: string;
	readonly identity?: WorktreeStatusIdentity | undefined;
}): string[] {
	const gitPaths = findGitPaths(options.identity?.cwd ?? options.cwd);
	if (gitPaths === undefined) return [];

	const paths = new Set<string>([gitPaths.headPath, join(gitPaths.commonGitDir, "packed-refs")]);
	const branch = plannedBranchName(gitPaths, options.identity);
	if (branch !== undefined) {
		const refPath = join(gitPaths.commonGitDir, "refs", "heads", ...branch.split("/"));
		paths.add(refPath);
		// Watch the containing directory too: a ref update writes the ref via temp-file
		// rename, which can detach a file-level watch after the first commit.
		paths.add(dirname(refPath));
	}

	return [...paths].filter((path) => existsSync(path));
}

function plannedBranchName(
	gitPaths: GitPaths,
	identity: WorktreeStatusIdentity | undefined,
): string | undefined {
	if (identity === undefined) return currentBranchName(gitPaths);
	return identity.head.type === "branch" ? identity.head.name : undefined;
}

function pathSetKey(paths: readonly string[]): string {
	return [...paths].sort().join("\0");
}

export function findGitPaths(cwd: string): GitPaths | undefined {
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

export function currentBranchName(gitPaths: GitPaths): string | undefined {
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

export function isSharedIdentityStillCurrent(
	cwd: string,
	identity: WorktreeStatusIdentity,
): boolean {
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
