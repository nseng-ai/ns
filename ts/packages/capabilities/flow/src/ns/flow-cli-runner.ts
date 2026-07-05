import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import {
	type CommandExecApi,
	type ExecOptions,
	outputListenerToExecCallbacks,
} from "@nseng-ai/foundation/command";
import { NsCommandExecApi } from "@nseng-ai/capability-kit/command-runner";
import {
	failed,
	ok,
	type ExecResult,
	type NsExtensionApi,
	type NsResult,
} from "@nseng-ai/ns/kernel/sdk";

export interface FlowCliExecOptions {
	cwd?: string;
	timeout?: number;
}

export interface FlowCliOperationInput {
	exec(command: string, args: string[], options?: FlowCliExecOptions): Promise<ExecResult>;
}

export interface FlowCliRunnerInput extends FlowCliOperationInput {
	stdout(text: string): void;
	stderr(text: string): void;
}

export interface RunFlowCliOperationOptions<T> {
	ctx: NsExtensionApi;
	shouldForwardLiveOutput?: boolean;
	trustedExec?: CommandExecApi;
	run(input: FlowCliOperationInput): Promise<T>;
}

export interface RunFlowCliOptions {
	ctx: NsExtensionApi;
	successMessage: string;
	failureMessage: string;
	shouldForwardLiveOutput?: boolean;
	trustedExec?: CommandExecApi;
	outputMode?: "forward-live" | "buffer-until-complete";
	afterExitCode?: (exitCode: number) => Promise<void> | void;
	run(input: FlowCliRunnerInput): Promise<number>;
}

export interface FlowCliOutputCapture {
	readonly input: Pick<FlowCliRunnerInput, "stdout" | "stderr">;
	readonly stdout: string;
	readonly stderr: string;
	flush(): void;
	toResult(
		exitCode: number,
		messages: { successMessage: string; failureMessage: string },
	): NsResult;
}

export interface CreateFlowCliOutputCaptureOptions {
	ctx: NsExtensionApi;
	mode?: "forward-live" | "buffer-until-complete";
}

export async function runFlowCliOperation<T>(options: RunFlowCliOperationOptions<T>): Promise<T> {
	const trustedExec = options.trustedExec ?? createTrustedFlowCliExec();
	return await options.run({
		exec: async (command, args, execOptions) =>
			await execFlowCliCommand({
				ctx: options.ctx,
				trustedExec,
				command,
				args,
				options: execOptions,
				liveOutput: { shouldForwardLiveOutput: options.shouldForwardLiveOutput === true },
			}),
	});
}

export function createFlowCliOutputCapture(
	options: CreateFlowCliOutputCaptureOptions,
): FlowCliOutputCapture {
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

export async function runFlowCli(options: RunFlowCliOptions): Promise<NsResult> {
	const output = createFlowCliOutputCapture({
		ctx: options.ctx,
		...(options.outputMode === undefined ? {} : { mode: options.outputMode }),
	});
	const exitCode = await runFlowCliOperation({
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

interface ExecFlowCliCommandOptions {
	ctx: NsExtensionApi;
	trustedExec: CommandExecApi;
	command: string;
	args: string[];
	options: FlowCliExecOptions | undefined;
	liveOutput: { shouldForwardLiveOutput: boolean };
}

async function execFlowCliCommand(options: ExecFlowCliCommandOptions): Promise<ExecResult> {
	const cwd = options.options?.cwd ?? options.ctx.cwd;
	if (cwd === options.ctx.cwd) {
		return await createScopedFlowCliExec(options.ctx).exec(
			options.command,
			[...options.args],
			buildFlowCliExecOptions(options, cwd, { includeEnv: false }),
		);
	}
	return await options.trustedExec.exec(
		options.command,
		[...options.args],
		buildFlowCliExecOptions(options, cwd, { includeEnv: true }),
	);
}

function createScopedFlowCliExec(ctx: NsExtensionApi): CommandExecApi {
	return new NsCommandExecApi(ctx);
}

function createTrustedFlowCliExec(): CommandExecApi {
	return new NodeCommandExecApi();
}

function buildFlowCliExecOptions(
	options: ExecFlowCliCommandOptions,
	cwd: string,
	execOptions: { includeEnv: boolean },
): ExecOptions {
	return {
		cwd,
		...(execOptions.includeEnv ? { env: options.ctx.env } : {}),
		...(options.options?.timeout === undefined ? {} : { timeout: options.options.timeout }),
		...buildFlowCliOutputCallbacks(options),
	};
}

function buildFlowCliOutputCallbacks(
	options: ExecFlowCliCommandOptions,
): Pick<ExecOptions, "onStdout" | "onStderr"> {
	if (!options.liveOutput.shouldForwardLiveOutput) return {};
	return outputListenerToExecCallbacks(options.ctx.onOutput);
}
