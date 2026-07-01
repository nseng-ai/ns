import { runCommand } from "@sdl/exec";
import type { CommandRunner, ExecOptions, ExecResult } from "@sdl/exec";

export type CommandOutput = ExecResult;
export type CommandOptions = ExecOptions;
export type { CommandRunner };

export interface FormatCommandFailureOptions {
	readonly verb?: "exited" | "failed with exit code";
}

export const runRealCommand: CommandRunner = runCommand;

export function formatCommandFailure(
	commandName: string,
	result: Pick<CommandOutput, "code" | "stdout" | "stderr">,
	options: FormatCommandFailureOptions = {},
): string {
	const verb = options.verb ?? "failed with exit code";
	const status =
		verb === "exited" ? `exited ${result.code}` : `failed with exit code ${result.code}`;
	return `${commandName} ${status}. stdout: ${result.stdout.trim() || "(empty)"} stderr: ${result.stderr.trim() || "(empty)"}`;
}
