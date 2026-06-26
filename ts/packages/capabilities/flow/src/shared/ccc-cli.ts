import {
	NodeCommandExecApi,
	outputListenerToExecCallbacks,
	type CommandExecApi,
	type ExecOptions,
} from "@sdl/core/exec";
import { SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import { failed, ok, type ExecResult, type SdlExtensionApi, type SdlResult } from "sdl-sdk";

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
				trustedExec: options.trustedExec ?? createTrustedFlowCccExec(),
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
	const cwd = options.options?.cwd ?? options.ctx.cwd;
	if (cwd === options.ctx.cwd) {
		return await createScopedFlowCccExec(options.ctx).exec(
			options.command,
			[...options.args],
			buildScopedFlowCccExecOptions(options, cwd),
		);
	}
	return await options.trustedExec.exec(
		options.command,
		[...options.args],
		buildTrustedFlowCccExecOptions(options, cwd),
	);
}

function createScopedFlowCccExec(ctx: SdlExtensionApi): CommandExecApi {
	return new SdlCommandExecApi(ctx);
}

function createTrustedFlowCccExec(): CommandExecApi {
	return new NodeCommandExecApi();
}

function buildScopedFlowCccExecOptions(
	options: ExecFlowCccCommandOptions,
	cwd: string,
): ExecOptions {
	return {
		cwd,
		...(options.options?.timeout === undefined ? {} : { timeout: options.options.timeout }),
		...buildFlowCccOutputCallbacks(options),
	};
}

function buildTrustedFlowCccExecOptions(
	options: ExecFlowCccCommandOptions,
	cwd: string,
): ExecOptions {
	return {
		cwd,
		env: options.ctx.env,
		...(options.options?.timeout === undefined ? {} : { timeout: options.options.timeout }),
		...buildFlowCccOutputCallbacks(options),
	};
}

function buildFlowCccOutputCallbacks(
	options: ExecFlowCccCommandOptions,
): Pick<ExecOptions, "onStdout" | "onStderr"> {
	if (!options.liveOutput.shouldForwardLiveOutput) return {};
	return outputListenerToExecCallbacks(options.ctx.onOutput);
}
