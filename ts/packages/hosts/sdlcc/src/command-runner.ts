import { runCommand, type CommandRunner, type ExecOptions, type ExecResult } from "@sdl/core/exec";

export type CommandOutput = ExecResult;
export type CommandOptions = ExecOptions;
export type { CommandRunner };

export const runRealCommand: CommandRunner = runCommand;
