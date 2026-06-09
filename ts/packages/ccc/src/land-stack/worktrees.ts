import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { formatCommand } from "@asdl/pi-extension-runtime/command-runtime";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { GIT_TIMEOUT_MS } from "./constants.ts";
import { failure, landStackFailure, success, type LandStackResult } from "./errors.ts";
import type { LandStackExtensionAPI, WorktreeConflict, WorktreeEntry } from "./types.ts";

export interface DetectWorktreeConflictsOptions {
	normalizePath?: ((path: string) => string) | undefined;
}

export async function detectWorktreeConflicts(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	currentBranch: string,
	relevantBranches: string[],
	options: DetectWorktreeConflictsOptions = {},
): Promise<LandStackResult<WorktreeConflict[]>> {
	const normalizePath = options.normalizePath ?? normalizeExistingPath;
	const worktrees = await loadWorktrees(pi, repoRoot);
	if (worktrees.type === "failure") return worktrees;

	const relevant = new Set(relevantBranches);
	const currentPath = normalizePath(repoRoot);
	const conflicts: WorktreeConflict[] = [];

	for (const worktree of worktrees.value) {
		if (!worktree.branch || !relevant.has(worktree.branch)) continue;
		const worktreePath = normalizePath(worktree.path);
		if (worktree.branch === currentBranch && worktreePath === currentPath) {
			conflicts.push({ branch: worktree.branch, path: worktree.path, kind: "current" });
			continue;
		}
		conflicts.push({
			branch: worktree.branch,
			path: worktree.path,
			kind: isManagedSlotPath(worktree.path) ? "managed-slot" : "manual-worktree",
		});
	}

	return success(conflicts);
}

export async function loadWorktrees(pi: LandStackExtensionAPI, repoRoot: string): Promise<LandStackResult<WorktreeEntry[]>> {
	const result = await exec(pi, "git", ["worktree", "list", "--porcelain"], repoRoot, GIT_TIMEOUT_MS);
	if (result.code !== 0) {
		return failure(
			landStackFailure(`Could not inspect git worktrees.\n${formatCommandDetails(result, formatCommand("git", ["worktree", "list", "--porcelain"]))}`),
		);
	}
	return success(parseWorktreeList(result.stdout));
}

export function parseWorktreeList(output: string): WorktreeEntry[] {
	const entries: WorktreeEntry[] = [];
	let current: WorktreeEntry | undefined;

	const pushCurrent = () => {
		if (current?.path) {
			entries.push(current);
		}
	};

	for (const line of output.split("\n")) {
		if (line.startsWith("worktree ")) {
			pushCurrent();
			current = { path: line.slice("worktree ".length).trim() };
			continue;
		}
		if (!current) continue;
		if (line.startsWith("branch ")) {
			const ref = line.slice("branch ".length).trim();
			current.branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
		}
	}
	pushCurrent();
	return entries;
}

export function isManagedSlotPath(path: string): boolean {
	const normalized = path.replaceAll("\\", "/");
	return normalized.includes("/.slots/repos/") && /\/worktrees\/slot-[^/]+(?:\/|$)/.test(normalized);
}

export function slotNameFromPath(path: string): string | undefined {
	const normalized = path.replaceAll("\\", "/");
	return normalized.match(/\/worktrees\/(slot-[^/]+)/)?.[1];
}

export function normalizeExistingPath(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return resolve(path);
	}
}

export function formatManualWorktreeConflict(conflicts: WorktreeConflict[]): string {
	if (conflicts.length === 1) {
		const conflict = conflicts[0];
		return `Branch ${conflict?.branch ?? "unknown"} is checked out in non-slot worktree ${conflict?.path ?? "unknown"}; detach it manually and rerun.`;
	}
	return [
		"Relevant branches are checked out in non-slot worktrees; detach them manually and rerun:",
		...conflicts.map((conflict) => `- ${conflict.branch} ${conflict.path}`),
	].join("\n");
}

export function formatSlotConflict(conflict: WorktreeConflict): string {
	const slot = slotNameFromPath(conflict.path);
	return slot ? `${slot} ${conflict.branch} ${conflict.path}` : `${conflict.branch} ${conflict.path}`;
}

export function formatConflict(conflict: WorktreeConflict): string {
	if (conflict.kind === "managed-slot") return formatSlotConflict(conflict);
	return `${conflict.branch} ${conflict.path} (${conflict.kind})`;
}
