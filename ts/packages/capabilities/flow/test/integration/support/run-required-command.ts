import { type ExecResult, formatCommandResultFailure } from "@sdl/core/command";
import { runCommand } from "@sdl/core/exec";

const DEFAULT_REQUIRED_COMMAND_TIMEOUT_MS = 60_000;

export interface RunRequiredCommandOptions {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
	readonly command: string;
	readonly args: readonly string[];
}

export interface RequiredCommandRunnerOptions {
	readonly failureContext: string;
	readonly timeoutMs?: number;
}

export function createRequiredCommandRunner(
	options: RequiredCommandRunnerOptions,
): (commandOptions: RunRequiredCommandOptions) => Promise<ExecResult> {
	return async function runRequiredCommand(
		commandOptions: RunRequiredCommandOptions,
	): Promise<ExecResult> {
		const result = await runCommand(commandOptions.command, commandOptions.args, {
			cwd: commandOptions.cwd,
			env: commandOptions.env,
			timeout: options.timeoutMs ?? DEFAULT_REQUIRED_COMMAND_TIMEOUT_MS,
		});
		if (result.code === 0 && !result.killed) return result;
		throw new Error(
			formatCommandResultFailure(
				options.failureContext,
				commandOptions.command,
				commandOptions.args,
				result,
			),
		);
	};
}
