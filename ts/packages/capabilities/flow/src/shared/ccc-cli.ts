import { NodeCommandExecApi } from "@sdl/exec";
import {
	type CommandExecApi,
	type ExecOptions,
	outputListenerToExecCallbacks,
} from "@sdl/core/command";
import { SdlCommandExecApi } from "@sdl/capability-kit/command-runner";
import { failed, ok, type ExecResult, type SdlExtensionApi, type SdlResult } from "sdl-sdk";

export interface FlowCccCliExecOptions {
	cwd?: string;
	timeout?: number;
}

export interface FlowCccOperationInput {
	exec(command: string, args: string[], options?: FlowCccCliExecOptions): Promise<ExecResult>;
}

export interface FlowCccCliRunnerInput extends FlowCccOperationInput {
	stdout(text: string): void;
	stderr(text: string): void;
}

export interface RunFlowCccOperationOptions<T> {
	ctx: SdlExtensionApi;
	shouldForwardLiveOutput?: boolean;
	trustedExec?: CommandExecApi;
	run(input: FlowCccOperationInput): Promise<T>;
}

export interface RunFlowCccCliOptions {
	ctx: SdlExtensionApi;
	successMessage: string;
	failureMessage: string;
	shouldForwardLiveOutput?: boolean;
	trustedExec?: CommandExecApi;
	outputMode?: "forward-live" | "buffer-until-complete";
	afterExitCode?: (exitCode: number) => Promise<void> | void;
	run(input: FlowCccCliRunnerInput): Promise<number>;
}

export interface FlowCccCliOutputCapture {
	readonly input: Pick<FlowCccCliRunnerInput, "stdout" | "stderr">;
	readonly stdout: string;
	readonly stderr: string;
	flush(): void;
	toResult(
		exitCode: number,
		messages: { successMessage: string; failureMessage: string },
	): SdlResult;
}

export interface CreateFlowCccCliOutputCaptureOptions {
	ctx: SdlExtensionApi;
	mode?: "forward-live" | "buffer-until-complete";
}

export async function runFlowCccOperation<T>(options: RunFlowCccOperationOptions<T>): Promise<T> {
	const trustedExec = options.trustedExec ?? createTrustedFlowCccExec();
	return await options.run({
		exec: async (command, args, execOptions) =>
			await execFlowCccCommand({
				ctx: options.ctx,
				trustedExec,
				command,
				args,
				options: execOptions,
				liveOutput: { shouldForwardLiveOutput: options.shouldForwardLiveOutput === true },
			}),
	});
}

export function createFlowCccCliOutputCapture(
	options: CreateFlowCccCliOutputCaptureOptions,
): FlowCccCliOutputCapture {
	let stdout = "";
	let stderr = "";
	const shouldForwardLive = options.mode !== "buffer-until-complete";
	return {
		input: {
			stdout: (text) => {
				stdout += text;
				if (shouldForwardLive) options.ctx.stdout?.(text);
			},
			stderr: (text) => {
				stderr += text;
				if (shouldForwardLive) options.ctx.stderr?.(text);
			},
		},
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
		flush: () => {
			if (stdout !== "") options.ctx.stdout?.(stdout);
			if (stderr !== "") options.ctx.stderr?.(stderr);
		},
		toResult: (exitCode, messages) => {
			if (exitCode === 0) return ok(stdout === "" ? messages.successMessage : "");
			return failed(stderr === "" ? messages.failureMessage : "", exitCode);
		},
	};
}

export async function runFlowCccCli(options: RunFlowCccCliOptions): Promise<SdlResult> {
	const output = createFlowCccCliOutputCapture({
		ctx: options.ctx,
		...(options.outputMode === undefined ? {} : { mode: options.outputMode }),
	});
	const exitCode = await runFlowCccOperation({
		ctx: options.ctx,
		...(options.trustedExec === undefined ? {} : { trustedExec: options.trustedExec }),
		...(options.shouldForwardLiveOutput === undefined
			? {}
			: { shouldForwardLiveOutput: options.shouldForwardLiveOutput }),
		run: async (io) => await options.run({ exec: io.exec, ...output.input }),
	});
	await options.afterExitCode?.(exitCode);
	if (options.outputMode === "buffer-until-complete") output.flush();
	return output.toResult(exitCode, {
		successMessage: options.successMessage,
		failureMessage: options.failureMessage,
	});
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
