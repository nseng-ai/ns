import {
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
	commandSucceeded,
	formatCommand,
	formatCommandFailure,
	formatCommandStartupFailure,
} from "@ns/core/exec";
import { formatErrorMessage, type ExplicitUndefined } from "@ns/core/primitives";

// Neutral cmux command runner: keep process execution behind CommandExecApi for package extraction.
export const CMUX_STARTUP_FAILURE_EXIT_CODE = 127;

export interface CmuxCommandFailure {
	command: string[];
	displayCommand: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	isKilled: boolean;
	startupError?: string;
}

export type CmuxCommandResult =
	| { type: "success"; result: ExecResult }
	| { type: "failed"; failure: CmuxCommandFailure };

export interface CmuxCommandExecHost {
	exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number; signal?: AbortSignal },
	): Promise<ExecResult>;
}

export interface RunCmuxCommandOptions {
	commands: CommandExecApi;
	args: readonly string[];
	cwd: string;
	timeoutMs: number;
	env?: ExplicitUndefined<"env-map", NodeJS.ProcessEnv>;
	signal?: ExplicitUndefined<"abort-signal", AbortSignal>;
}

export function cmuxCommandExecApi(host: CmuxCommandExecHost): CommandExecApi {
	return {
		async exec(command, args, options) {
			return await host.exec(command, args, options);
		},
	};
}

export async function runCmuxCommand(options: RunCmuxCommandOptions): Promise<CmuxCommandResult> {
	const args = [...options.args];
	const command = ["cmux", ...args];
	const displayCommand = formatCommand("cmux", args);
	const execOptions: ExecOptions = {
		cwd: options.cwd,
		timeout: options.timeoutMs,
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.signal === undefined ? {} : { signal: options.signal }),
	};

	let result: ExecResult;
	try {
		result = await options.commands.exec("cmux", args, execOptions);
	} catch (error) {
		const startupError = formatErrorMessage(error);
		const stderr = formatCommandStartupFailure("cmux command failed", displayCommand, error);
		return {
			type: "failed",
			failure: {
				command,
				displayCommand,
				exitCode: CMUX_STARTUP_FAILURE_EXIT_CODE,
				stdout: "",
				stderr,
				isKilled: false,
				startupError,
			},
		};
	}

	if (commandSucceeded(result)) return { type: "success", result };

	return {
		type: "failed",
		failure: {
			command,
			displayCommand,
			exitCode: result.code,
			stdout: result.stdout,
			stderr:
				result.stderr || result.startupError || (result.killed ? "cmux command timed out." : ""),
			isKilled: result.killed,
		},
	};
}

export function formatCmuxCommandFailure(failure: CmuxCommandFailure): string {
	if (failure.startupError !== undefined) {
		return formatCommandStartupFailure(
			"cmux command failed",
			failure.displayCommand,
			failure.startupError,
		);
	}
	return formatCommandFailure("cmux command failed", failure.displayCommand, {
		stdout: failure.stdout,
		stderr: failure.stderr,
		code: failure.exitCode,
		killed: failure.isKilled,
	});
}
