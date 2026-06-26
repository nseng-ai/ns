import { RealGitGateway } from "@sdl/core/git";
import type { ExecResult } from "@sdl/core/exec";
import { commandSucceeded, type SdlExtensionApi } from "@sdl/sdl/sdk";

import { SdlCommandExecApi } from "./command-runner.ts";

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

export function createSdlGitGateway(ctx: SdlExtensionApi): RealGitGateway {
	return new RealGitGateway(new SdlCommandExecApi(ctx));
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
