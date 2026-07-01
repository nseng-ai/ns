import { runCommand } from "@sdl/exec";
import type { CommandRunner, ExecOptions, ExecResult } from "@sdl/exec";

export type CommandOutput = ExecResult;
export type CommandOptions = ExecOptions;
export type { CommandRunner };

export const runRealCommand: CommandRunner = runCommand;

export function formatInlineCommandFailure(
	commandName: string,
	result: Pick<CommandOutput, "code" | "stdout" | "stderr">,
): string {
	const stdout = result.stdout.trim();
	const stderr = result.stderr.trim();
	return `${commandName} failed with exit code ${result.code}. stdout: ${stdout === "" ? "(empty)" : stdout} stderr: ${stderr === "" ? "(empty)" : stderr}`;
}
