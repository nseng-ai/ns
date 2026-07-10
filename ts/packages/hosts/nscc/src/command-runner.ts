import {
	formatCommandFailure,
	formatCommandSpawnFailure,
	runCommand,
} from "@nseng-ai/foundation/exec";
import type { CommandRunner, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

export type CommandOutput = ExecResult;
export type CommandOptions = ExecOptions;
export type { CommandRunner };

export const runRealCommand: CommandRunner = runCommand;

export function formatInlineCommandFailure(commandName: string, result: ExecResult): string {
	if (result.type === "exited" && result.signal === null) {
		const stdout = result.stdout.trim();
		const stderr = result.stderr.trim();
		return `${commandName} failed with exit code ${result.code ?? "unknown"}. stdout: ${stdout === "" ? "(empty)" : stdout} stderr: ${stderr === "" ? "(empty)" : stderr}`;
	}
	if (result.type === "spawn-failed") {
		return formatCommandSpawnFailure(`${commandName} failed`, commandName, result.error);
	}
	return formatCommandFailure(`${commandName} failed`, commandName, result);
}
