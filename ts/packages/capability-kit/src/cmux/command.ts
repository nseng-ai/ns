import {
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
	commandSucceeded,
	formatCommand,
	formatCommandFailure,
	formatCommandSpawnFailure,
} from "@nseng-ai/foundation/exec";
import { formatErrorMessage, type ExplicitUndefined } from "@nseng-ai/foundation/primitives";

// Neutral cmux command runner: keep process execution behind CommandExecApi for package extraction.
export interface CmuxCommandFailure {
	command: string[];
	displayCommand: string;
	result: ExecResult;
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
		const message = formatErrorMessage(error);
		result = { type: "spawn-failed", stdout: "", stderr: message, error: message };
	}

	if (commandSucceeded(result)) return { type: "success", result };
	return { type: "failed", failure: { command, displayCommand, result } };
}

export function formatCmuxCommandFailure(failure: CmuxCommandFailure): string {
	if (failure.result.type === "spawn-failed") {
		return formatCommandSpawnFailure(
			"cmux command failed",
			failure.displayCommand,
			failure.result.error,
		);
	}
	return formatCommandFailure("cmux command failed", failure.displayCommand, failure.result);
}
