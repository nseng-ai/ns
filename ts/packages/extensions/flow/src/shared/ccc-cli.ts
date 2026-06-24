import { NodeCommandExecApi, type CommandExecApi } from "@sdl/core/exec";
import { failed, ok, type ExecResult, type SdlExtensionApi, type SdlResult } from "@sdl/sdl/sdk";

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
	shouldForwardLiveOutput?: boolean | undefined;
	trustedExec?: CommandExecApi | undefined;
	run(input: FlowCccCliRunnerInput): Promise<number>;
}

export async function runFlowCccCli(options: RunFlowCccCliOptions): Promise<SdlResult> {
	let stdout = "";
	let stderr = "";
	const exitCode = await options.run({
		exec: async (command, args, execOptions) =>
			await execFlowCccCommand({
				ctx: options.ctx,
				trustedExec: options.trustedExec ?? new NodeCommandExecApi(),
				command,
				args,
				options: execOptions,
				liveOutput: { shouldForwardLiveOutput: options.shouldForwardLiveOutput === true },
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
	trustedExec: CommandExecApi;
	command: string;
	args: string[];
	options: FlowCccCliExecOptions | undefined;
	liveOutput: { shouldForwardLiveOutput: boolean };
}

async function execFlowCccCommand(options: ExecFlowCccCommandOptions): Promise<ExecResult> {
	const onOutput = options.ctx.onOutput;
	const outputOptions =
		options.liveOutput.shouldForwardLiveOutput && onOutput !== undefined
			? {
					onStdout: (text: string) => onOutput("stdout", text),
					onStderr: (text: string) => onOutput("stderr", text),
				}
			: {};
	const cwd = options.options?.cwd ?? options.ctx.cwd;
	if (cwd === options.ctx.cwd) {
		return await options.ctx.exec(options.command, [...options.args], {
			...(options.options?.timeout === undefined ? {} : { timeoutMs: options.options.timeout }),
			...outputOptions,
		});
	}
	return await options.trustedExec.exec(options.command, [...options.args], {
		cwd,
		env: options.ctx.env,
		...(options.options?.timeout === undefined ? {} : { timeout: options.options.timeout }),
		...outputOptions,
	});
}
