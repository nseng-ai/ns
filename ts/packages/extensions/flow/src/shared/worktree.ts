import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
	type WorktreeCommandResult,
} from "@sdl/sdl/pending-worktree";
import {
	formatCommandError,
	withTemporaryFile,
	type ExecResult,
	type SdlExtensionApi,
} from "@sdl/sdl/sdk";

import { execFlowGit } from "./git.ts";

export type { PendingWorktreeError, PendingWorktreeSnapshot, WorktreeCommandResult };

export { formatCommandDetails } from "@sdl/sdl/sdk";

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

interface ExecExtensionCommandOptions {
	ctx: SdlExtensionApi;
	command: string;
	args: string[];
	cwd?: string | undefined;
	timeoutMs?: number | undefined;
	onStdout?: ((text: string) => void) | undefined;
	onStderr?: ((text: string) => void) | undefined;
}

interface CliExecOptions {
	cwd?: string | undefined;
	timeout?: number | undefined;
}

interface CliExecAdapterOptions {
	ctx: SdlExtensionApi;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
}

export function createCliExecAdapter(options: CliExecAdapterOptions) {
	return async (command: string, args: string[], execOptions?: CliExecOptions) =>
		await execExtensionCommand({
			ctx: options.ctx,
			command,
			args,
			...(execOptions?.cwd === undefined ? {} : { cwd: execOptions.cwd }),
			...(execOptions?.timeout === undefined ? {} : { timeoutMs: execOptions.timeout }),
			...(options.onOutput === undefined
				? {}
				: {
						onStdout: (text: string) => options.onOutput?.("stdout", text),
						onStderr: (text: string) => options.onOutput?.("stderr", text),
					}),
		});
}

export async function execExtensionCommand(
	options: ExecExtensionCommandOptions,
): Promise<ExecResult> {
	if (options.cwd !== undefined && options.cwd !== options.ctx.cwd) {
		return {
			code: 2,
			stdout: "",
			stderr: `SDL command execution is scoped to ${options.ctx.cwd}; refusing command cwd ${options.cwd}.`,
			killed: false,
		};
	}
	return await options.ctx.exec(options.command, options.args, {
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	});
}

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
