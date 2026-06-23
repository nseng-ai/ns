import { formatCommand, formatCommandDetails, type ExecResult } from "@sdl/sdl/sdk";

export interface FlowCommandFailure {
  code: string;
  message: string;
}

export interface FlowCommandFailureOptions {
  command: string;
  args: readonly string[];
  result: ExecResult;
  code: string;
  message: string;
}

export function commandFailure(options: FlowCommandFailureOptions): FlowCommandFailure | undefined {
  if (options.result.code === 0 && !options.result.killed) return undefined;
  const details = formatCommandDetails(options.result);
  const suffix = `\nCommand: ${formatCommand(options.command, options.args)}\n${details}`;
  return { code: options.code, message: `${options.message}${suffix}` };
}

