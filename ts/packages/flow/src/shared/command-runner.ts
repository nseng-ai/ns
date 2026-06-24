import type { CommandExecApi, CommandRunner, ExecOptions, ExecResult } from "@sdl/core/exec";

import type { SdlExecOptions, SdlExtensionApi } from "@sdl/sdl/sdk";

export function createSdlCommandRunner(ctx: SdlExtensionApi): CommandRunner {
	return async (command, args, options) => {
		const cwdError = validateSdlExecCwd(ctx, options);
		if (cwdError !== undefined) return cwdError;
		return ctx.exec(command, [...args], convertExecOptions(options));
	};
}

export class SdlCommandExecApi implements CommandExecApi {
	private readonly runner: CommandRunner;

	constructor(ctx: SdlExtensionApi) {
		this.runner = createSdlCommandRunner(ctx);
	}

	exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		return this.runner(command, args, options);
	}
}

function convertExecOptions(options: ExecOptions | undefined): SdlExecOptions | undefined {
	if (options === undefined) return undefined;
	return {
		...(options.timeout === undefined ? {} : { timeoutMs: options.timeout }),
		...(options.stdin === undefined ? {} : { stdin: options.stdin }),
		...(options.onStdout === undefined ? {} : { onStdout: options.onStdout }),
		...(options.onStderr === undefined ? {} : { onStderr: options.onStderr }),
	};
}

function validateSdlExecCwd(
	ctx: SdlExtensionApi,
	options: ExecOptions | undefined,
): ExecResult | undefined {
	if (options?.cwd === undefined || options.cwd === ctx.cwd) return undefined;
	return {
		code: 2,
		stdout: "",
		stderr: `SDL command execution is scoped to ${ctx.cwd}; refusing command cwd ${options.cwd}.`,
		killed: false,
	};
}
