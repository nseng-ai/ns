import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync as nodeExistsSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type {
	ChildSessionCancelledResult,
	ChildSessionContext,
	ChildSessionErrorResult,
	ChildSessionOptions,
	ChildSessionPi,
	ChildSessionProgress,
	ChildSessionResult,
	ChildSessionStoppedWithoutTerminalResult,
} from "../run-child-session.ts";
import { createChildSessionJsonEventParser } from "./json-events.ts";

const DEFAULT_STDERR_LIMIT_BYTES = 8 * 1024;
const DEFAULT_KILL_TIMEOUT_MS = 5_000;
const STOPPED_WITHOUT_TERMINAL_DIAGNOSTIC =
	"Child Pi stopped without terminal capture. Terminal capture outcomes are not implemented in this slice.";

export type PiInvocation = {
	command: string;
	args: string[];
};

export type SpawnChildProcessOptions = {
	cwd: string;
	shell: false;
	stdio: ["ignore", "pipe", "pipe"];
};

export type ReadableDataStreamLike = {
	on(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
};

export type SpawnedChildProcess = {
	stdout?: ReadableDataStreamLike | null;
	stderr?: ReadableDataStreamLike | null;
	kill(signal?: NodeJS.Signals | number): boolean;
	on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
};

export type SpawnChildProcess = (command: string, args: string[], options: SpawnChildProcessOptions) => SpawnedChildProcess;

export type ChildSessionRunnerDependencies = {
	spawn?: SpawnChildProcess;
	now?: () => number;
	createSessionFile?: (input: { cwd: string; title?: string }) => string | Promise<string>;
	processArgv?: readonly string[];
	processExecPath?: string;
	existsSync?: (path: string) => boolean;
	setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimeout?: (timeout: ReturnType<typeof setTimeout>) => void;
	killTimeoutMs?: number;
	stderrLimitBytes?: number;
};

export async function runChildSessionProcess<TTerminalInput = unknown>(
	pi: ChildSessionPi,
	ctx: ChildSessionContext,
	options: ChildSessionOptions,
	dependencies: ChildSessionRunnerDependencies = {},
): Promise<ChildSessionResult<TTerminalInput>> {
	void pi;
	const now = dependencies.now ?? Date.now;
	const startTimeMs = now();
	const cwd = options.cwd ?? ctx.cwd;
	const title = options.title;
	const abortSignals = uniqueAbortSignals(ctx.signal, options.signal);

	if (abortSignals.some((signal) => signal.aborted)) {
		return cancelledResult(title, stoppedProgress({ title, now, startTimeMs }), abortReason(abortSignals));
	}

	let sessionFile: string;
	try {
		sessionFile = await createSessionFile(cwd, title, dependencies);
	} catch (error) {
		const progress = stoppedProgress({ title, now, startTimeMs });
		return errorResult(title, progress, `Failed to create child Pi session file: ${errorMessage(error)}`, error);
	}

	const parser = createChildSessionJsonEventParser({
		...(title === undefined ? {} : { title }),
		sessionFile,
		now,
		startTimeMs,
	});
	const stderr = new BoundedTextBuffer(dependencies.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES);
	const childArgs = buildChildPiArgs(options.prompt, sessionFile);
	const invocation = resolvePiInvocation(childArgs, dependencies);
	const spawn = dependencies.spawn ?? defaultSpawnChildProcess;
	const timers = {
		setTimeout: dependencies.setTimeout ?? setTimeout,
		clearTimeout: dependencies.clearTimeout ?? clearTimeout,
	};
	const killTimeoutMs = dependencies.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS;

	let child: SpawnedChildProcess;
	try {
		child = spawn(invocation.command, invocation.args, {
			cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		parser.markStopped();
		return errorResult(title, parser.getProgress(), `Failed to spawn child Pi process: ${errorMessage(error)}`, error);
	}

	return await new Promise<ChildSessionResult<TTerminalInput>>((resolve) => {
		let settled = false;
		let closed = false;
		let cancelled = false;
		let killRequested = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const removeAbortListeners: Array<() => void> = [];

		const finish = (result: ChildSessionResult<TTerminalInput>) => {
			if (settled) return;
			settled = true;
			for (const remove of removeAbortListeners) remove();
			if (killTimer !== undefined) timers.clearTimeout(killTimer);
			resolve(result);
		};

		const terminateChild = () => {
			if (killRequested) return;
			killRequested = true;
			child.kill("SIGTERM");
			killTimer = timers.setTimeout(() => {
				if (!closed) child.kill("SIGKILL");
			}, killTimeoutMs);
		};

		const cancel = () => {
			cancelled = true;
			terminateChild();
		};

		for (const signal of abortSignals) {
			if (signal.aborted) {
				cancel();
				continue;
			}
			const listener = () => cancel();
			signal.addEventListener("abort", listener, { once: true });
			removeAbortListeners.push(() => signal.removeEventListener("abort", listener));
		}

		child.stdout?.on("data", (chunk) => {
			parser.pushChunk(chunk);
			const snapshot = parser.getSnapshot();
			if (snapshot.error && !cancelled) {
				terminateChild();
			}
		});

		child.stderr?.on("data", (chunk) => {
			stderr.append(chunk);
		});

		child.on("error", (error) => {
			parser.markStopped();
			finish(errorResult(title, parser.getProgress(), `Failed to spawn child Pi process: ${error.message}`, error));
		});

		child.on("close", (code, closeSignal) => {
			closed = true;
			if (killTimer !== undefined) timers.clearTimeout(killTimer);
			parser.finish();
			const snapshot = parser.getSnapshot();
			const progress = snapshot.progress;

			if (cancelled) {
				finish(cancelledResult(title, progress, abortReason(abortSignals)));
				return;
			}

			if (snapshot.error) {
				finish(errorResult(title, progress, snapshot.error.message, snapshot.error));
				return;
			}

			if (code !== 0) {
				finish(errorResult(title, progress, nonzeroExitDiagnostic(code, closeSignal, stderr.toString())));
				return;
			}

			if (snapshot.stopReason === "error" || snapshot.stopReason === "aborted") {
				const message = snapshot.errorMessage ?? `Child Pi stopped with stopReason ${snapshot.stopReason}.`;
				finish(errorResult(title, progress, message, new Error(message)));
				return;
			}

			finish(stoppedWithoutTerminalResult(title, progress, snapshot.stopReason));
		});
	});
}

export function buildChildPiArgs(prompt: string, sessionFile: string): string[] {
	return ["--mode", "json", "-p", "--session", sessionFile, prompt];
}

export function resolvePiInvocation(args: string[], dependencies: ChildSessionRunnerDependencies = {}): PiInvocation {
	const processArgv = dependencies.processArgv ?? process.argv;
	const processExecPath = dependencies.processExecPath ?? process.execPath;
	const existsSync = dependencies.existsSync ?? nodeExistsSync;
	const currentScript = processArgv[1];

	if (currentScript && isSafelyDiscoverablePiScript(currentScript) && existsSync(currentScript)) {
		return { command: processExecPath, args: [currentScript, ...args] };
	}

	const execName = basename(processExecPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return { command: processExecPath, args };
	}

	return { command: "pi", args };
}

async function createSessionFile(cwd: string, title: string | undefined, dependencies: ChildSessionRunnerDependencies): Promise<string> {
	if (dependencies.createSessionFile) {
		return await dependencies.createSessionFile({ cwd, ...(title === undefined ? {} : { title }) });
	}
	return await createDefaultSessionFile();
}

async function createDefaultSessionFile(): Promise<string> {
	const root = join(tmpdir(), "pi-child-sessions");
	await mkdir(root, { recursive: true, mode: 0o700 });
	const dir = await mkdtemp(join(root, "session-"));
	return join(dir, `${randomUUID()}.jsonl`);
}

function defaultSpawnChildProcess(command: string, args: string[], options: SpawnChildProcessOptions): SpawnedChildProcess {
	return nodeSpawn(command, args, options);
}

function stoppedWithoutTerminalResult(
	title: string | undefined,
	progress: ChildSessionProgress,
	stopReason: string | undefined,
): ChildSessionStoppedWithoutTerminalResult {
	return {
		...(title === undefined ? {} : { title }),
		status: "stopped-without-terminal",
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		diagnostic: STOPPED_WITHOUT_TERMINAL_DIAGNOSTIC,
		...(stopReason === undefined ? {} : { stopReason }),
	};
}

function cancelledResult(
	title: string | undefined,
	progress: ChildSessionProgress,
	reason: string | undefined,
): ChildSessionCancelledResult {
	return {
		...(title === undefined ? {} : { title }),
		status: "cancelled",
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		diagnostic: "Child Pi cancelled by parent abort signal.",
		...(reason === undefined ? {} : { reason }),
	};
}

function errorResult(
	title: string | undefined,
	progress: ChildSessionProgress,
	diagnostic: string,
	error: unknown = new Error(diagnostic),
): ChildSessionErrorResult {
	return {
		...(title === undefined ? {} : { title }),
		status: "error",
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		diagnostic,
		error: errorPayload(error, diagnostic),
	};
}

function stoppedProgress(input: {
	title: string | undefined;
	now: () => number;
	startTimeMs: number;
	sessionFile?: string;
}): ChildSessionProgress {
	const elapsedMs = Math.max(0, input.now() - input.startTimeMs);
	return {
		...(input.title === undefined ? {} : { title: input.title }),
		state: "stopped",
		toolCount: 0,
		turnCount: 0,
		elapsedMs,
		...(input.sessionFile === undefined ? {} : { sessionFile: input.sessionFile }),
	};
}

function errorPayload(error: unknown, fallbackMessage: string): ChildSessionErrorResult["error"] {
	if (!(error instanceof Error)) return { message: fallbackMessage };
	return {
		message: error.message || fallbackMessage,
		...(error.name === undefined || error.name.length === 0 ? {} : { name: error.name }),
		...(error.stack === undefined ? {} : { stack: error.stack }),
	};
}

function nonzeroExitDiagnostic(code: number | null, signal: NodeJS.Signals | null, stderr: string): string {
	const exitText = code === null ? "without an exit code" : `with exit code ${code}`;
	const signalText = signal ? ` after signal ${signal}` : "";
	const stderrText = stderr.trim().length > 0 ? `\n\nstderr:\n${stderr}` : "";
	return `Child Pi exited ${exitText}${signalText}.${stderrText}`;
}

function uniqueAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal[] {
	const unique: AbortSignal[] = [];
	for (const signal of signals) {
		if (signal && !unique.includes(signal)) unique.push(signal);
	}
	return unique;
}

function abortReason(signals: readonly AbortSignal[]): string | undefined {
	for (const signal of signals) {
		if (!signal.aborted) continue;
		const reason = signal.reason as unknown;
		if (reason instanceof Error) return reason.message;
		if (typeof reason === "string" && reason.length > 0) return reason;
	}
	return undefined;
}

function isSafelyDiscoverablePiScript(scriptPath: string): boolean {
	if (scriptPath.startsWith("/$bunfs/root/")) return false;
	const scriptName = basename(scriptPath).toLowerCase();
	return /^(pi|pi-coding-agent)(\.[cm]?[jt]s)?$/.test(scriptName) || scriptPath.includes("pi-coding-agent");
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

class BoundedTextBuffer {
	private value = "";
	private omittedBytes = 0;

	constructor(private readonly limitBytes: number) {}

	append(chunk: string | Uint8Array): void {
		this.value += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		const bytes = Buffer.byteLength(this.value, "utf8");
		if (bytes <= this.limitBytes) return;

		const buffer = Buffer.from(this.value, "utf8");
		const tail = buffer.subarray(buffer.length - this.limitBytes);
		this.omittedBytes += buffer.length - tail.length;
		this.value = tail.toString("utf8");
	}

	toString(): string {
		if (this.omittedBytes === 0) return this.value;
		return `… ${this.omittedBytes} stderr byte(s) omitted\n${this.value}`;
	}
}
