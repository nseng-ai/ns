import { runCommand } from "@sdl/exec";
import type { CommandRunner, ExecOptions, ExecResult } from "@sdl/exec";

export type CommandOutput = ExecResult;
export type CommandOptions = ExecOptions;
export type { CommandRunner };

export const runRealCommand: CommandRunner = runCommand;
