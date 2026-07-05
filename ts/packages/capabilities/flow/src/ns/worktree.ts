import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
	type WorktreeCommandResult,
} from "@ns/capability-kit/pending-worktree";
import { createNsCliExecAdapter, execNsCommand, execNsGit } from "@ns/capability-kit/git";
import { formatCommandDetails, formatCommandError, type ExecResult } from "@ns/core/command";
import { withTemporaryFile } from "@ns/capability-kit/temp-files";
import type { NsExtensionApi } from "@ns/kernel/sdk";

export type { PendingWorktreeError, PendingWorktreeSnapshot, WorktreeCommandResult };

export { formatCommandDetails };

export async function loadFlowPendingWorktreeSnapshot(
	ctx: NsExtensionApi,
): Promise<
	{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
	return await loadPendingWorktreeSnapshot({
		cwd: ctx.cwd,
		execGit: (args, timeout) => execGit(ctx, args, timeout),
	});
}

export function execGit(
	ctx: NsExtensionApi,
	args: readonly string[],
	timeoutMs: number,
): Promise<ExecResult> {
	return execNsGit(ctx, args, timeoutMs);
}

export const createCliExecAdapter = createNsCliExecAdapter;
export const execExtensionCommand = execNsCommand;

export async function createCommitWithPreparedMessage(
	ctx: NsExtensionApi,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return await withTemporaryFile(
		{ prefix: "ns-extension-cp-commit-", filename: "message.txt", contents: `${message}\n` },
		async (messagePath) => {
			const add = await execNsGit(ctx, ["add", "-A"], 30_000);
			if (add.code !== 0) {
				return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
			}

			const commit = await execNsGit(ctx, ["commit", "-F", messagePath], 120_000);
			if (commit.code !== 0) {
				return { error: formatCommandError("Checkpoint commit failed.", commit) };
			}

			const log = await execNsGit(ctx, ["log", "-1", "--oneline"], 5_000);
			if (log.code !== 0) {
				return {
					error: formatCommandError("Created checkpoint commit, but failed to read it back.", log),
				};
			}

			return { summary: log.stdout.trim() };
		},
	);
}
