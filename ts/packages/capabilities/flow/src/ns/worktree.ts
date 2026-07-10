import {
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
	type WorktreeCommandResult,
} from "@nseng-ai/capability-kit/pending-worktree";
import { createNsGitGateway } from "@nseng-ai/capability-kit/git";
import { createNsCliExecAdapter, execNsCommand, execNsGit } from "./exec.ts";
import { commandSucceeded, type ExecResult } from "@nseng-ai/foundation/command";
import { withTemporaryFile } from "@nseng-ai/capability-kit/temp-files";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";
import {
	createAutobranchGitGateway,
	type AutobranchGitGateway,
} from "../autobranch/git-gateway.ts";
import type { AutobranchExec } from "../autobranch/shared.ts";

export type { PendingWorktreeError, PendingWorktreeSnapshot, WorktreeCommandResult };

export function formatCommandDetails(result: ExecResult): string {
	const detail = result.stderr.trim() || result.stdout.trim();
	const status = flowCommandTermination(result);
	return detail === "" ? status : `${status}: ${detail}`;
}

function formatCommandError(summary: string, result: ExecResult): string {
	return `${summary}\n${formatCommandDetails(result)}`;
}

function flowCommandTermination(result: ExecResult): string {
	switch (result.type) {
		case "spawn-failed":
			return `spawn failed: ${result.error}`;
		case "cancelled":
			return "cancelled";
		case "timed-out":
			return "timed out";
		case "exited":
			return result.signal === null
				? `exit ${result.code}`
				: `signal ${result.signal} (exit ${result.code})`;
	}
}

export async function loadFlowPendingWorktreeSnapshot(
	ctx: NsExtensionApi,
): Promise<
	{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
	return await loadPendingWorktreeSnapshot({
		cwd: ctx.cwd,
		git: createNsGitGateway(ctx),
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

export function createAutobranchExecContext(
	ctx: NsExtensionApi,
	cwd: string,
): { exec: AutobranchExec; git: AutobranchGitGateway } {
	const exec: AutobranchExec = (command, commandArgs, timeout) =>
		execExtensionCommand({ ctx, command, args: commandArgs, cwd, timeoutMs: timeout });
	return { exec, git: createAutobranchGitGateway({ cwd, exec }) };
}

export async function createCommitWithPreparedMessage(
	ctx: NsExtensionApi,
	message: string,
): Promise<{ summary: string } | { error: string }> {
	return await withTemporaryFile(
		{ prefix: "ns-extension-cp-commit-", filename: "message.txt", contents: `${message}\n` },
		async (messagePath) => {
			const add = await execNsGit(ctx, ["add", "-A"], 30_000);
			if (!commandSucceeded(add)) {
				return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
			}

			const commit = await execNsGit(ctx, ["commit", "-F", messagePath], 120_000);
			if (!commandSucceeded(commit)) {
				return { error: formatCommandError("Checkpoint commit failed.", commit) };
			}

			const log = await execNsGit(ctx, ["log", "-1", "--oneline"], 5_000);
			if (!commandSucceeded(log)) {
				return {
					error: formatCommandError("Created checkpoint commit, but failed to read it back.", log),
				};
			}

			return { summary: log.stdout.trim() };
		},
	);
}
