import type {
	CommandExecApi,
	CommandRunner,
	ExecOptions,
	ExecResult,
	StdinCapableCommandExecApi,
} from "@nseng-ai/core/exec";

import type { NsExecOptions, NsExtensionApi } from "@nseng-ai/kernel/sdk";

export function createNsCommandRunner(ctx: NsExtensionApi): CommandRunner {
	return async (command, args, options) => {
		const cwdError = validateNsExecCwd(ctx, options);
		if (cwdError !== undefined) return cwdError;
		return ctx.exec(command, [...args], convertExecOptions(options));
	};
}

export class NsCommandExecApi implements CommandExecApi {
	private readonly runner: CommandRunner;

	constructor(ctx: NsExtensionApi) {
		this.runner = createNsCommandRunner(ctx);
	}

	exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		return this.runner(command, args, options);
	}
}

export class NsStdinCapableCommandExecApi
	extends NsCommandExecApi
	implements StdinCapableCommandExecApi
{
	readonly supportsStdin = true as const;
}

function convertExecOptions(options: ExecOptions | undefined): NsExecOptions | undefined {
	if (options === undefined) return undefined;
	return {
		...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
		...(options.stdin === undefined ? {} : { stdin: options.stdin }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	};
}

function validateNsExecCwd(
	ctx: NsExtensionApi,
	options: ExecOptions | undefined,
): ExecResult | undefined {
	if (options?.cwd === undefined || options.cwd === ctx.cwd) return undefined;
	return {
		code: 2,
		stdout: "",
		stderr: `ns command execution is scoped to ${ctx.cwd}; refusing command cwd ${options.cwd}.`,
		killed: false,
	};
}
