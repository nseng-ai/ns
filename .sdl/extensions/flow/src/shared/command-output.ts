import type { ExecResult } from "@sdl/sdl/sdk";

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
  const details = options.result.stderr.trim() || options.result.stdout.trim();
  const killed = options.result.killed ? " (killed or timed out)" : "";
  const suffix = details
    ? `\n${formatCommand(options.command, options.args)} exited ${options.result.code}${killed}: ${details}`
    : `\n${formatCommand(options.command, options.args)} exited ${options.result.code}${killed}`;
  return { code: options.code, message: `${options.message}${suffix}` };
}

export function formatCommandError(summary: string, result: ExecResult): string {
  return [summary, formatCommandDetails(result)].join("\n");
}

export function formatCommandDetails(result: ExecResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  const killed = result.killed ? " (killed or timed out)" : "";
  return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}

export function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(formatCommandArg).join(" ");
}

function formatCommandArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
  return JSON.stringify(arg);
}
