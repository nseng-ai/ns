import { NodeCommandExecApi } from "@nseng-ai/foundation/exec";
import {
	type CommandExecApi,
	type ExecOptions,
	outputListenerToExecCallbacks,
} from "@nseng-ai/foundation/command";
import { NsCommandExecApi } from "@nseng-ai/extension-kit/command-runner";
import type { ExecResult, NsExtensionApi } from "@nseng-ai/sdk";

export const FLOW_COMMAND_FAILED = "flow-command-failed";

export interface FlowCliExecOptions {
	cwd?: string;
	timeout?: number;
}

export interface FlowCliOperationInput {
	exec(command: string, args: string[], options?: FlowCliExecOptions): Promise<ExecResult>;
}

export interface RunFlowCliOperationOptions<T> {
	ctx: NsExtensionApi;
	shouldForwardLiveOutput?: boolean;
	trustedExec?: CommandExecApi;
	run(input: FlowCliOperationInput): Promise<T>;
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
