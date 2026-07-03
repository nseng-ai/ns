import type { CommandExecApi, ExecOptions, ExecResult } from "@ji/core/exec";

import { VibechkError } from "./store.ts";

export interface RunVibechkCommandOptions {
	readonly execApi: CommandExecApi;
	readonly command: string;
	readonly args: readonly string[];
	readonly execOptions?: ExecOptions;
	readonly missingExecutableMessage: string;
	readonly startupFailurePrefix: string;
}

export async function runVibechkCommand(options: RunVibechkCommandOptions): Promise<ExecResult> {
	let result: ExecResult;
	try {
		result = await options.execApi.exec(options.command, [...options.args], options.execOptions);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw commandStartupError(options, message);
	}
	if (result.startupError !== undefined) {
		throw commandStartupError(options, result.startupError);
	}
	return result;
}

export function isMissingExecutableError(message: string): boolean {
	return message.includes("ENOENT");
}

function commandStartupError(options: RunVibechkCommandOptions, message: string): VibechkError {
	if (isMissingExecutableError(message)) {
		return new VibechkError(options.missingExecutableMessage);
	}
	return new VibechkError(`${options.startupFailurePrefix}: ${message}`);
}
