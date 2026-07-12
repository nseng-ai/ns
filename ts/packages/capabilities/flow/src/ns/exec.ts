import { commandSucceeded, type ExecResult } from "@nseng-ai/foundation/command";
import type { NsExtensionApi } from "@nseng-ai/sdk";

export type NsGitPorcelainStatusResult =
	| { ok: true; isClean: boolean; stdout: string; result: ExecResult }
	| { ok: false; result: ExecResult };

export interface ExecNsCommandOptions {
	ctx: NsExtensionApi;
	command: string;
	args: readonly string[];
	cwd?: string;
	timeoutMs?: number;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
}

interface CliExecOptions {
	cwd?: string;
	timeout?: number;
}

interface NsCliExecAdapterOptions {
	ctx: NsExtensionApi;
	onOutput?: (stream: "stdout" | "stderr", text: string) => void;
}

export async function execNsCommand(options: ExecNsCommandOptions): Promise<ExecResult> {
	if (options.cwd !== undefined && options.cwd !== options.ctx.cwd) {
		return {
			type: "exited",
			code: 2,
			signal: null,
			stdout: "",
			stderr: `ns command execution is scoped to ${options.ctx.cwd}; refusing command cwd ${options.cwd}.`,
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

export function createNsCliExecAdapter(options: NsCliExecAdapterOptions) {
	return async (command: string, args: string[], execOptions?: CliExecOptions) =>
		await execNsCommand({
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

export async function execNsGit(
	ctx: NsExtensionApi,
	args: readonly string[],
	timeoutMs?: number,
): Promise<ExecResult> {
	return await execNsCommand({
		ctx,
		command: "git",
		args,
		...(timeoutMs === undefined ? {} : { timeoutMs }),
	});
}

export async function readNsGitPorcelainStatus(
	ctx: NsExtensionApi,
	timeoutMs?: number,
): Promise<NsGitPorcelainStatusResult> {
	const result = await execNsGit(ctx, ["status", "--porcelain"], timeoutMs);
	if (!commandSucceeded(result)) return { ok: false, result };

	const stdout = result.stdout;
	return { ok: true, isClean: stdout.trim().length === 0, stdout, result };
}
