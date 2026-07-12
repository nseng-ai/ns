import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import { parseGitWorktreePorcelain } from "@nseng-ai/foundation/git";
import { exec, formatCommandDetails } from "./command-exec.ts";
import { GIT_TIMEOUT_MS } from "./constants.ts";
import type { WorktreeEntry } from "../types.ts";
import { landFailure, landingExecutionFailure, landSuccess, type LandResult } from "../results.ts";
import type { LandStackExtensionAPI } from "./types.ts";

export async function loadWorktrees(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<WorktreeEntry[]>> {
	const result = await exec({
		pi,
		command: "git",
		args: ["worktree", "list", "--porcelain"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				`Could not inspect git worktrees.\n${formatCommandDetails(result, formatCommand("git", ["worktree", "list", "--porcelain"]))}`,
			),
		);
	}
	return landSuccess(parseWorktreeList(result.stdout));
}

export function parseWorktreeList(output: string): WorktreeEntry[] {
	return parseGitWorktreePorcelain(output).map((entry) =>
		entry.branch === null ? { path: entry.path } : { path: entry.path, branch: entry.branch },
	);
}

export function normalizeExistingPath(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return resolve(path);
	}
}
