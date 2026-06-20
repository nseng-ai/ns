import {
	formatCommand,
	formatCommandStartupFailure,
	isSuccessfulExecResult,
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
} from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";

export const CMUX_STARTUP_FAILURE_EXIT_CODE = 127;

export interface CmuxCommandFailure {
	command: string[];
	displayCommand: string;
	exitCode: number;
	stdout: string;
	stderr: string;
	killed: boolean;
	startupError?: string;
}

export type CmuxCommandResult =
	| { type: "success"; result: ExecResult }
	| { type: "failed"; failure: CmuxCommandFailure };

export interface RunCmuxCommandOptions {
	commands: CommandExecApi;
	args: readonly string[];
	cwd: string;
	timeoutMs: number;
	env?: NodeJS.ProcessEnv | undefined;
	signal?: AbortSignal | undefined;
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
				killed: false,
				startupError,
			},
		};
	}

	if (isSuccessfulExecResult(result)) return { type: "success", result };

	return {
		type: "failed",
		failure: {
			command,
			displayCommand,
			exitCode: result.code,
			stdout: result.stdout,
			stderr:
				result.stderr || result.startupError || (result.killed ? "cmux command timed out." : ""),
			killed: result.killed,
		},
	};
}
