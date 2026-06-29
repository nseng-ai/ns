import type { ExecResult } from "@sdl/core/exec";
import { commandSucceeded, type SdlExtensionApi } from "sdl-sdk";

export interface GitWorktreePorcelainEntry {
	path: string;
	branch: string | null;
}

export type LocalBranchRefreshPlan =
	| {
			type: "pull-checked-out-branch";
			cwd: string;
			args: string[];
	  }
	| {
			type: "fetch-local-branch";
			cwd: string;
			args: string[];
	  };

export interface LocalBranchRefreshPlanOptions {
	branch: string;
	cwd: string;
	worktreePorcelain: string;
}

export function planLocalBranchRefreshFromWorktrees(
	options: LocalBranchRefreshPlanOptions,
): LocalBranchRefreshPlan {
	const checkedOutPath = parseGitWorktreePorcelain(options.worktreePorcelain).find(
		(entry) => entry.branch === options.branch,
	)?.path;
	if (checkedOutPath !== undefined) {
		return {
			type: "pull-checked-out-branch",
			cwd: checkedOutPath,
			args: ["pull", "--ff-only", "origin", options.branch],
		};
	}

	return {
		type: "fetch-local-branch",
		cwd: options.cwd,
		args: ["fetch", "origin", `refs/heads/${options.branch}:refs/heads/${options.branch}`],
	};
}

export function parseGitWorktreePorcelain(stdout: string): GitWorktreePorcelainEntry[] {
	const entries: GitWorktreePorcelainEntry[] = [];
	let current: GitWorktreePorcelainEntry | null = null;

	function pushCurrent(): void {
		if (current !== null) entries.push(current);
		current = null;
	}

	for (const line of stdout.split("\n")) {
		if (line.length === 0) {
			pushCurrent();
			continue;
		}
		if (line.startsWith("worktree ")) {
			pushCurrent();
			current = { path: line.slice("worktree ".length), branch: null };
			continue;
		}
		if (current !== null && line.startsWith("branch ")) {
			const ref = line.slice("branch ".length);
			current = {
				...current,
				branch: ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref,
			};
		}
	}
	pushCurrent();
	return entries;
}

export type SdlGitPorcelainStatusResult =
	| { ok: true; isClean: boolean; stdout: string; result: ExecResult }
	| { ok: false; result: ExecResult };

export interface ExecSdlCommandOptions {
	ctx: SdlExtensionApi;
	command: string;
	args: readonly string[];
	cwd?: string | undefined;
	timeoutMs?: number | undefined;
	onStdout?: ((text: string) => void) | undefined;
	onStderr?: ((text: string) => void) | undefined;
}

interface CliExecOptions {
	cwd?: string | undefined;
	timeout?: number | undefined;
}

interface SdlCliExecAdapterOptions {
	ctx: SdlExtensionApi;
	onOutput?: ((stream: "stdout" | "stderr", text: string) => void) | undefined;
}

export async function execSdlCommand(options: ExecSdlCommandOptions): Promise<ExecResult> {
	if (options.cwd !== undefined && options.cwd !== options.ctx.cwd) {
		return {
			code: 2,
			stdout: "",
			stderr: `SDL command execution is scoped to ${options.ctx.cwd}; refusing command cwd ${options.cwd}.`,
			killed: false,
		};
	}
	const execOptions = {
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	};
	return Object.keys(execOptions).length === 0
		? await options.ctx.exec(options.command, [...options.args])
		: await options.ctx.exec(options.command, [...options.args], execOptions);
}

export function createSdlCliExecAdapter(options: SdlCliExecAdapterOptions) {
	return async (command: string, args: string[], execOptions?: CliExecOptions) =>
		await execSdlCommand({
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

export async function execSdlGit(
	ctx: SdlExtensionApi,
	args: readonly string[],
	timeoutMs?: number,
): Promise<ExecResult> {
	return await execSdlCommand({
		ctx,
		command: "git",
		args,
		...(timeoutMs === undefined ? {} : { timeoutMs }),
	});
}

export async function readSdlGitPorcelainStatus(
	ctx: SdlExtensionApi,
	timeoutMs?: number,
): Promise<SdlGitPorcelainStatusResult> {
	const result = await execSdlGit(ctx, ["status", "--porcelain"], timeoutMs);
	if (!commandSucceeded(result)) return { ok: false, result };

	const stdout = result.stdout;
	return { ok: true, isClean: stdout.trim().length === 0, stdout, result };
}
