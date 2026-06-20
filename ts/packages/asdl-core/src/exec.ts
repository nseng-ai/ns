import { spawn, type SpawnOptions } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import process from "node:process";

import { stripTerminalEscapes } from "./terminal-escapes.ts";
import { systemTimerScheduler, type ScheduledTimer, type TimerScheduler } from "./timers.ts";

export { stripTerminalEscapes } from "./terminal-escapes.ts";

const DEFAULT_TIMEOUT_KILL_GRACE_MS = 5_000;
const TIMEOUT_EXIT_CODE = 124;
const STARTUP_FAILURE_EXIT_CODE = 127;
export const MAX_ERROR_CHARS = 4_000;
export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	startupError?: string;
}

export interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
	timeoutKillGraceMs?: number;
	signal?: AbortSignal;
	stdin?: string;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
}

export interface RunCommandOptions extends ExecOptions {
	readonly timers?: TimerScheduler;
}

export type CommandRunner = (
	executable: string,
	args: readonly string[],
	options?: ExecOptions,
) => Promise<ExecResult>;

export interface CommandExecApi {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export function execApiToCommandRunner(execApi: CommandExecApi): CommandRunner {
	return async (command, args, options) => await execApi.exec(command, [...args], options);
}

export interface PiExecResultLike {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
	startupError?: string;
}

export interface PiExecApiLike {
	exec(command: string, args: string[], options?: ExecOptions): Promise<PiExecResultLike>;
}

export function piExecApiToCommandExecApi(execApi: PiExecApiLike): CommandExecApi {
	return {
		async exec(command, args, options) {
			return normalizeExecResult(await execApi.exec(command, args, options));
		},
	};
}

export interface TailTextOptions {
	maxChars: number;
	maxLines?: number;
}

export type CommandResolver = (name: string) => string | undefined;

export interface CommandPrefix {
	command: string;
	args: string[];
}

export class NodeCommandExecApi implements CommandExecApi {
	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		return runCommand(command, args, options);
	}
}

export async function runCommand(
	command: string,
	args: readonly string[],
	options: RunCommandOptions = {},
): Promise<ExecResult> {
	return new Promise((resolve) => {
		const timers = options.timers ?? systemTimerScheduler;
		let stdout = "";
		let stderr = "";
		let hasSettled = false;
		let hasTimedOut = false;
		let startupError: string | undefined;
		let timeoutTimer: ScheduledTimer | undefined;
		let killTimer: ScheduledTimer | undefined;

		const spawnOptions: SpawnOptions = {
			shell: false,
			stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
		};
		if (options.cwd !== undefined) {
			spawnOptions.cwd = options.cwd;
		}
		if (options.env !== undefined) {
			spawnOptions.env = options.env;
		}
		if (options.signal !== undefined) {
			spawnOptions.signal = options.signal;
		}

		const clearTimers = (): void => {
			timeoutTimer?.cancel();
			killTimer?.cancel();
		};

		const finish = (exitCode: number, killed: boolean): void => {
			if (hasSettled) return;
			hasSettled = true;
			clearTimers();
			resolve({
				stdout,
				stderr,
				code: hasTimedOut ? TIMEOUT_EXIT_CODE : exitCode,
				killed: hasTimedOut || killed,
				...(startupError === undefined ? {} : { startupError }),
			});
		};

		const child = spawn(command, [...args], spawnOptions);
		if (options.timeout !== undefined && options.timeout > 0) {
			timeoutTimer = timers.setTimeout(() => {
				hasTimedOut = true;
				child.kill("SIGTERM");

				const graceMs = options.timeoutKillGraceMs ?? DEFAULT_TIMEOUT_KILL_GRACE_MS;
				if (graceMs <= 0) {
					child.kill("SIGKILL");
					return;
				}

				killTimer = timers.setTimeout(() => {
					if (!hasSettled) child.kill("SIGKILL");
				}, graceMs);
			}, options.timeout);
		}

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
			options.onStdout?.(chunk);
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
			options.onStderr?.(chunk);
		});
		if (options.stdin !== undefined) {
			child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
				if (error.code === "EPIPE") return;
				if (stderr.length === 0) stderr = error.message;
			});
			try {
				child.stdin?.end(options.stdin);
			} catch (error) {
				const stdinError = error as NodeJS.ErrnoException;
				if (stdinError.code !== "EPIPE" && stderr.length === 0) {
					stderr = stdinError instanceof Error ? stdinError.message : String(stdinError);
				}
			}
		}
		child.on("error", (error) => {
			startupError = error instanceof Error ? error.message : String(error);
			if (stderr.length === 0) stderr = startupError;
			finish(STARTUP_FAILURE_EXIT_CODE, false);
		});
		child.on("close", (code, signal) => {
			finish(code ?? 1, signal !== null);
		});
	});
}

export function normalizeExecResult(result: PiExecResultLike): ExecResult {
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.code,
		killed: Boolean(result.killed),
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
	};
}

export function isSuccessfulExecResult(result: ExecResult): boolean {
	return result.code === 0 && !result.killed;
}

export function commandFailureReason(result: ExecResult): string {
	const stderr = result.stderr.trim();
	return stderr !== "" ? stderr : `exit code ${result.code}${result.killed ? " (killed)" : ""}`;
}

export function formatCommand(command: string, args: readonly string[]): string {
	return [command, ...args].map(formatShellArg).join(" ");
}

export function formatCommandResultFailure(
	title: string,
	command: string,
	args: readonly string[],
	result: ExecResult,
): string {
	const displayCommand = formatCommand(command, args);
	if (result.startupError !== undefined) {
		return formatCommandStartupFailure(title, displayCommand, result.startupError);
	}
	return formatCommandFailure(title, displayCommand, result);
}

export function formatShellArg(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
		return value;
	}

	return shellQuote(value);
}

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function tailText(text: string, options: TailTextOptions): string {
	const maxChars = Math.max(0, Math.trunc(options.maxChars));
	const lineLimited = applyLineLimit(text, options.maxLines);
	let tail = lineLimited.text;

	if (tail.length > maxChars) {
		tail = maxChars === 0 ? "…" : `…${tail.slice(-maxChars)}`;
	}

	if (lineLimited.omittedLines > 0) {
		return `… ${lineLimited.omittedLines} earlier line(s) omitted\n${tail}`;
	}

	return tail;
}

export function formatOutputSection(
	name: "stdout" | "stderr",
	output: string,
	options: TailTextOptions,
): string {
	const normalizedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n").trimEnd();
	const tail = normalizedOutput.length > 0 ? tailText(normalizedOutput, options) : "";
	return [`----- ${name} tail -----`, tail.length > 0 ? tail : "(empty)"].join("\n");
}

export function formatCommandFailure(
	title: string,
	displayCommand: string,
	result: ExecResult,
): string {
	const status = result.killed
		? `exit code ${result.code}; process was killed or timed out`
		: `exit code ${result.code}`;
	return tailText(
		[
			`${title} (${status}).`,
			`Command: ${displayCommand}`,
			formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
			formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

export function formatCommandStartupFailure(
	title: string,
	displayCommand: string,
	error: unknown,
): string {
	const message = stripTerminalEscapes(error instanceof Error ? error.message : String(error))
		.replace(/\r/g, "\n")
		.trimEnd();
	return tailText(
		[
			`${title} (failed before completion).`,
			`Command: ${displayCommand}`,
			["error:", message.length > 0 ? message : "(empty)"].join("\n"),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

export function defaultCommandResolver(name: string): string | undefined {
	if (name.includes("/")) {
		return executablePath(name);
	}

	const pathValue = process.env.PATH ?? "";
	for (const directory of pathValue.split(delimiter)) {
		if (directory === "") continue;
		const candidate = join(directory, name);
		const resolved = executablePath(candidate);
		if (resolved !== undefined) {
			return resolved;
		}
	}

	return undefined;
}

function applyLineLimit(
	text: string,
	maxLines: number | undefined,
): { text: string; omittedLines: number } {
	if (maxLines === undefined) {
		return { text, omittedLines: 0 };
	}

	const normalizedMaxLines = Math.max(0, Math.trunc(maxLines));
	const lines = text.split("\n");
	if (lines.length <= normalizedMaxLines) {
		return { text, omittedLines: 0 };
	}

	if (normalizedMaxLines === 0) {
		return { text: "", omittedLines: lines.length };
	}

	return {
		text: lines.slice(-normalizedMaxLines).join("\n"),
		omittedLines: lines.length - normalizedMaxLines,
	};
}

function executablePath(path: string): string | undefined {
	try {
		accessSync(path, constants.X_OK);
		return path;
	} catch {
		return undefined;
	}
}
