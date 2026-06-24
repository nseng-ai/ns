import { failed, ok, type ExecResult, type SdlExtensionApi, type SdlResult } from "@sdl/sdl/sdk";

import { execExtensionCommand } from "./worktree.ts";

export interface FlowCccCliExecOptions {
	cwd?: string | undefined;
	timeout?: number | undefined;
}

export interface FlowCccCliRunnerInput {
	exec(
		command: string,
		args: string[],
		options?: FlowCccCliExecOptions | undefined,
	): Promise<ExecResult>;
	stdout(text: string): void;
	stderr(text: string): void;
}

export interface RunFlowCccCliOptions {
	ctx: SdlExtensionApi;
	successMessage: string;
	failureMessage: string;
	forwardLiveOutput?: boolean | undefined;
	run(input: FlowCccCliRunnerInput): Promise<number>;
}

export async function runFlowCccCli(options: RunFlowCccCliOptions): Promise<SdlResult> {
	let stdout = "";
	let stderr = "";
	const exitCode = await options.run({
		exec: async (command, args, execOptions) =>
			await execFlowCccCommand({
				ctx: options.ctx,
				command,
				args,
				options: execOptions,
				liveOutput: { forwardLiveOutput: options.forwardLiveOutput === true },
			}),
		stdout: (text) => {
			stdout += text;
			options.ctx.stdout?.(text);
		},
		stderr: (text) => {
			stderr += text;
			options.ctx.stderr?.(text);
		},
	});
	if (exitCode === 0) return ok(stdout === "" ? options.successMessage : "");
	return failed(stderr === "" ? options.failureMessage : "", exitCode);
}

interface ExecFlowCccCommandOptions {
	ctx: SdlExtensionApi;
	command: string;
	args: string[];
	options: FlowCccCliExecOptions | undefined;
	liveOutput: { forwardLiveOutput: boolean };
}

async function execFlowCccCommand(options: ExecFlowCccCommandOptions): Promise<ExecResult> {
	const onOutput = options.ctx.onOutput;
	return await execExtensionCommand({
		ctx: options.ctx,
		command: options.command,
		args: [...options.args],
		...(options.options?.cwd === undefined ? {} : { cwd: options.options.cwd }),
		...(options.options?.timeout === undefined ? {} : { timeoutMs: options.options.timeout }),
		...(options.liveOutput.forwardLiveOutput && onOutput !== undefined
			? {
					onStdout: (text: string) => onOutput("stdout", text),
					onStderr: (text: string) => onOutput("stderr", text),
				}
			: {}),
	});
}
