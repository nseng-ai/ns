import { spawn, type SpawnOptions } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import process from "node:process";

import type { ExecOptions, ExecResult, StdinCapableCommandExecApi } from "@sdl/core/command";
import { formatErrorMessage } from "@sdl/core/primitives";
import type { ScheduledTimer, TimerScheduler } from "@sdl/core/timers";
import { systemTimerScheduler } from "@sdl/time";

export {
	commandFailureReason,
	commandSucceeded,
	execApiToCommandRunner,
	formatCommand,
	formatCommandDetails,
	formatCommandError,
	formatCommandEvidence,
	formatCommandFailure,
	formatCommandResultFailure,
	formatCommandStartupFailure,
	formatOutputSection,
	formatShellArg,
	isSuccessfulExecResult,
	MAX_ERROR_CHARS,
	normalizeExecResult,
	outputListenerToExecCallbacks,
	piExecApiToCommandExecApi,
	runNormalizedExecResult,
	shellQuote,
	stripTerminalEscapes,
	tailText,
	type CommandExecApi,
	type CommandPrefix,
	type CommandResolver,
	type CommandRunner,
	type ExecOptions,
	type ExecOutputListener,
	type ExecOutputStream,
	type ExecResult,
	type FormatCommandEvidenceOptions,
	type PiExecApiLike,
	type PiExecResultLike,
	type StdinCapableCommandExecApi,
	type TailTextOptions,
} from "@sdl/core/command";

const DEFAULT_TIMEOUT_KILL_GRACE_MS = 5_000;
const TIMEOUT_EXIT_CODE = 124;
const STARTUP_FAILURE_EXIT_CODE = 127;

export interface RunCommandOptions extends ExecOptions {
	readonly timers?: TimerScheduler;
}

export class NodeCommandExecApi implements StdinCapableCommandExecApi {
	readonly supportsStdin = true as const;
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
					stderr = formatErrorMessage(stdinError);
				}
			}
		}
		child.on("error", (error) => {
			startupError = formatErrorMessage(error);
			if (stderr.length === 0) stderr = startupError;
			finish(STARTUP_FAILURE_EXIT_CODE, false);
		});
		child.on("close", (code, signal) => {
			finish(code ?? 1, signal !== null);
		});
	});
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

function executablePath(path: string): string | undefined {
	try {
		accessSync(path, constants.X_OK);
		return path;
	} catch {
		return undefined;
	}
}
