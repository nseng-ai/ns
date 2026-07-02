import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
	type WorktreeCommandResult,
} from "@sdl/capability-kit/pending-worktree";
import { createSdlCliExecAdapter, execSdlCommand } from "@sdl/capability-kit/git";
import { formatCommandDetails, formatCommandError, type ExecResult } from "@sdl/core/command";
import { withTemporaryFile } from "@sdl/capability-kit/temp-files";
import type { SdlExtensionApi } from "@sdl/kernel/sdk";

import { execFlowGit } from "./git.ts";

export type { PendingWorktreeError, PendingWorktreeSnapshot, WorktreeCommandResult };

export { formatCommandDetails };

export async function loadFlowPendingWorktreeSnapshot(
	ctx: SdlExtensionApi,
): Promise<
	{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
	return await loadPendingWorktreeSnapshot({
		cwd: ctx.cwd,
		execGit: (args, timeout) => execGit(ctx, args, timeout),
	});
}

export function execGit(
	ctx: SdlExtensionApi,
	args: readonly string[],
	timeoutMs: number,
): Promise<ExecResult> {
	return execFlowGit(ctx, args, timeoutMs);
}

export const createCliExecAdapter = createSdlCliExecAdapter;
export const execExtensionCommand = execSdlCommand;

export async function createCommitWithPreparedMessage(
	ctx: SdlExtensionApi,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return await withTemporaryFile(
		{ prefix: "sdl-extension-cp-commit-", filename: "message.txt", contents: `${message}\n` },
		async (messagePath) => {
			const add = await execFlowGit(ctx, ["add", "-A"], 30_000);
			if (add.code !== 0) {
				return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
			}

			const commit = await execFlowGit(ctx, ["commit", "-F", messagePath], 120_000);
			if (commit.code !== 0) {
				return { error: formatCommandError("Checkpoint commit failed.", commit) };
			}

			const log = await execFlowGit(ctx, ["log", "-1", "--oneline"], 5_000);
			if (log.code !== 0) {
				return {
					error: formatCommandError("Created checkpoint commit, but failed to read it back.", log),
				};
			}

			return { summary: log.stdout.trim() };
		},
	);
}

export function formatPendingWorktreeError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Could not determine current branch.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not inspect git status.\n${details}`;
	}
	return `Could not capture git diff.\n${details}`;
}
