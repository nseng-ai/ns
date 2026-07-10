import { spawn, type SpawnOptions } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import process from "node:process";

import type {
	ExecOptions,
	ExecResult,
	StdinCapableCommandExecApi,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";

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
	formatCommandSpawnFailure,
	formatOutputSection,
	formatShellArg,
	MAX_ERROR_CHARS,
	outputListenerToExecCallbacks,
	shellQuote,
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
	type StdinCapableCommandExecApi,
	type TailTextOptions,
} from "@nseng-ai/foundation/command";
export { stripTerminalEscapes } from "@nseng-ai/foundation/terminal-escapes";

const DEFAULT_TERMINATION_KILL_GRACE_MS = 5_000;

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
	if (options.signal?.aborted === true) {
		return { type: "cancelled", stdout: "", stderr: "", code: null, signal: null };
	}

	return new Promise((resolve) => {
		const timers = options.timers ?? systemTimerScheduler;
		let stdout = "";
		let stderr = "";
		let hasSettled = false;
		let hasSpawned = false;
		let terminationCause: "cancelled" | "timed-out" | undefined;
		let timeoutTimer: ScheduledTimer | undefined;
		let killTimer: ScheduledTimer | undefined;

		const spawnOptions: SpawnOptions = {
			shell: false,
			stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
		};
		if (options.cwd !== undefined) spawnOptions.cwd = options.cwd;
		if (options.env !== undefined) spawnOptions.env = options.env;

		const clearLifecycle = (): void => {
			timeoutTimer?.cancel();
			killTimer?.cancel();
			options.signal?.removeEventListener("abort", cancel);
		};

		const settle = (result: ExecResult): void => {
			if (hasSettled) return;
			hasSettled = true;
			clearLifecycle();
			resolve(result);
		};

		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(command, [...args], spawnOptions);
		} catch (error) {
			const spawnError = formatErrorMessage(error);
			settle({
				type: "spawn-failed",
				stdout,
				stderr: spawnError,
				error: spawnError,
			});
			return;
		}

		function terminate(cause: "cancelled" | "timed-out"): void {
			if (hasSettled || terminationCause !== undefined) return;
			terminationCause = cause;
			timeoutTimer?.cancel();
			child.kill("SIGTERM");

			const graceMs = options.terminationKillGraceMs ?? DEFAULT_TERMINATION_KILL_GRACE_MS;
			if (graceMs <= 0) {
				child.kill("SIGKILL");
				return;
			}
			killTimer = timers.setTimeout(() => {
				if (!hasSettled) child.kill("SIGKILL");
			}, graceMs);
		}

		function cancel(): void {
			terminate("cancelled");
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
		child.on("spawn", () => {
			hasSpawned = true;
		});
		child.on("error", (error) => {
			const diagnostic = formatErrorMessage(error);
			if (!hasSpawned) {
				if (stderr.length === 0) stderr = diagnostic;
				settle({ type: "spawn-failed", stdout, stderr, error: diagnostic });
				return;
			}
			stderr = appendDiagnostic(stderr, diagnostic);
		});
		child.on("close", (code, signal) => {
			if (terminationCause === undefined) {
				settle({ type: "exited", stdout, stderr, code, signal });
				return;
			}
			settle({ type: terminationCause, stdout, stderr, code, signal });
		});

		if (options.timeout !== undefined && options.timeout > 0) {
			timeoutTimer = timers.setTimeout(() => terminate("timed-out"), options.timeout);
		}
		options.signal?.addEventListener("abort", cancel, { once: true });
		if (options.signal?.aborted === true) cancel();
	});
}

function appendDiagnostic(stderr: string, diagnostic: string): string {
	if (diagnostic === "" || stderr.endsWith(diagnostic)) return stderr;
	if (stderr === "") return diagnostic;
	return `${stderr}${stderr.endsWith("\n") ? "" : "\n"}${diagnostic}`;
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
