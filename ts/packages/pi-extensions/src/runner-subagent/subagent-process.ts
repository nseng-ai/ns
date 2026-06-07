import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync as nodeExistsSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import type {
	RunnerSubagentBlockedResult,
	RunnerSubagentCancelledResult,
	RunnerSubagentCompletedResult,
	RunnerSubagentContext,
	RunnerSubagentErrorResult,
	RunnerSubagentFinalTextResult,
	RunnerSubagentLaunchMetadata,
	RunnerSubagentOptions,
	RunnerSubagentPi,
	RunnerSubagentProgress,
	RunnerSubagentProtocolErrorResult,
	RunnerSubagentUpdate,
	RunnerSubagentResult,
	RunnerSubagentUsageMetadata,
	RunnerSubagentReturnMode,
	RunnerSubagentStoppedWithoutTerminalResult,
	RunnerSubagentStoppedWithoutUsefulTextResult,
	RunnerSubagentTerminalToolDefinition,
} from "../runner-subagent.ts";
import {
	createDefaultRunnerSubagentRuntimeFiles,
	readRuntimeResultFile,
	type RunnerSubagentRuntimeFiles,
	type CreateRunnerSubagentRuntimeFilesInput,
	type RuntimeFailureData,
	type RuntimeResultReadResult,
	type RuntimeResultV1,
} from "./subagent-runtime.ts";
import { emptyRunnerSubagentActivity } from "./activity.ts";
import { createRunnerSubagentJsonEventParser, type RunnerSubagentJsonEventParserSnapshot } from "./json-events.ts";
import { runnerSubagentSessionFile } from "./presentation.ts";
import { readRunnerSubagentUsageFromSessionFile, type ReadRunnerSubagentSessionFile } from "./usage.ts";

const DEFAULT_STDERR_LIMIT_BYTES = 8 * 1024;
const DEFAULT_KILL_TIMEOUT_MS = 5_000;
const STOPPED_WITHOUT_TERMINAL_DIAGNOSTIC = "Subagent Pi stopped without terminal capture.";
const STOPPED_WITHOUT_USEFUL_TEXT_DIAGNOSTIC = "Subagent Pi stopped without useful final assistant text.";

export interface PiInvocation {
	command: string;
	args: string[];
}

export interface BuildChildPiArgsInput {
	prompt: string;
	sessionFile: string;
	runtimeExtensionPath?: string;
	model?: string;
	launch?: RunnerSubagentLaunchMetadata;
}

export interface SpawnChildProcessOptions {
	cwd: string;
	shell: false;
	stdio: ["ignore", "pipe", "pipe"];
}

export interface ReadableDataStreamLike {
	on(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
}

export interface SpawnedChildProcess {
	stdout?: ReadableDataStreamLike | null;
	stderr?: ReadableDataStreamLike | null;
	kill(signal?: NodeJS.Signals | number): boolean;
	on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
}

export type SpawnChildProcess = (command: string, args: string[], options: SpawnChildProcessOptions) => SpawnedChildProcess;

export type CreateRunnerSubagentRuntimeFiles = (
	input: CreateRunnerSubagentRuntimeFilesInput,
) => RunnerSubagentRuntimeFiles | Promise<RunnerSubagentRuntimeFiles>;

export type ReadRunnerSubagentRuntimeResult = (resultPath: string) => RuntimeResultReadResult | Promise<RuntimeResultReadResult>;

export interface RunnerSubagentDispatcherDependencies {
	spawn?: SpawnChildProcess;
	now?: () => number;
	createSessionFile?: (input: { cwd: string; title?: string }) => string | Promise<string>;
	createRuntimeFiles?: CreateRunnerSubagentRuntimeFiles;
	readRuntimeResult?: ReadRunnerSubagentRuntimeResult;
	readSessionFile?: ReadRunnerSubagentSessionFile;
	processArgv?: readonly string[];
	processExecPath?: string;
	existsSync?: (path: string) => boolean;
	setTimeout?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
	clearTimeout?: (timeout: ReturnType<typeof setTimeout>) => void;
	killTimeoutMs?: number;
	stderrLimitBytes?: number;
}

export async function dispatchRunnerSubagentProcess<TTerminalInput = unknown>(
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: RunnerSubagentOptions,
	dependencies: RunnerSubagentDispatcherDependencies = {},
): Promise<RunnerSubagentResult<TTerminalInput>> {
	const now = dependencies.now ?? Date.now;
	const startTimeMs = now();
	const cwd = options.cwd ?? ctx.cwd;
	const title = options.title;
	const launch = resolveRunnerSubagentLaunch(pi, ctx, options);
	const abortSignals = uniqueAbortSignals(ctx.signal, options.signal);
	const updateEmitter = createUpdateEmitter(options.onProgress);

	if (abortSignals.some((signal) => signal.aborted)) {
		const progress = stoppedProgress({ title, now, startTimeMs, ...(launch === undefined ? {} : { launch }) });
		updateEmitter.emit(updateFromProgress(progress), { force: true });
		return cancelledResult(title, progress, abortReason(abortSignals));
	}

	const returnMode = runnerSubagentReturnMode(options);
	const terminalTools = runnerSubagentTerminalTools(options);
	let runtimeFiles: RunnerSubagentRuntimeFiles | undefined;
	if (returnMode === "terminal" || terminalTools.length > 0) {
		try {
			const createRuntimeFiles = dependencies.createRuntimeFiles ?? createDefaultRunnerSubagentRuntimeFiles;
			runtimeFiles = await createRuntimeFiles({
				...(title === undefined ? {} : { title }),
				terminalTools,
			});
		} catch (error) {
			const progress = stoppedProgress({ title, now, startTimeMs, ...(launch === undefined ? {} : { launch }) });
			updateEmitter.emit(updateFromProgress(progress), { force: true });
			return errorResult(title, progress, `Invalid subagent terminal runtime configuration: ${errorMessage(error)}`, error);
		}
	}

	let sessionFile: string;
	try {
		sessionFile = await createSessionFile(cwd, title, dependencies);
	} catch (error) {
		await cleanupRuntimeFiles(runtimeFiles);
		const progress = stoppedProgress({ title, now, startTimeMs, ...(launch === undefined ? {} : { launch }) });
		updateEmitter.emit(updateFromProgress(progress), { force: true });
		return errorResult(title, progress, `Failed to create subagent session file: ${errorMessage(error)}`, error);
	}

	const terminalToolNames = terminalTools.map((tool) => tool.name);
	const parser = createRunnerSubagentJsonEventParser({
		...(title === undefined ? {} : { title }),
		sessionFile,
		now,
		startTimeMs,
		terminalToolNames,
		...(launch === undefined ? {} : { launch }),
	});
	updateEmitter.emit(updateFromSnapshot(parser.getSnapshot()), { force: true });
	const stderr = new BoundedTextBuffer(dependencies.stderrLimitBytes ?? DEFAULT_STDERR_LIMIT_BYTES);
	const childArgs = buildChildPiArgs({
		prompt: options.prompt,
		sessionFile,
		...(runtimeFiles?.extensionPath === undefined ? {} : { runtimeExtensionPath: runtimeFiles.extensionPath }),
		...(options.model === undefined ? {} : { model: options.model }),
		...(launch === undefined ? {} : { launch }),
	});
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
		updateEmitter.emit(updateFromSnapshot(parser.getSnapshot()), { force: true });
		await cleanupRuntimeFiles(runtimeFiles);
		return errorResult(title, parser.getProgress(), `Failed to spawn subagent Pi process: ${errorMessage(error)}`, error);
	}

	return await new Promise<RunnerSubagentResult<TTerminalInput>>((resolve) => {
		let settled = false;
		let closed = false;
		let cancelled = false;
		let killRequested = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const removeAbortListeners: Array<() => void> = [];

		const finish = (result: RunnerSubagentResult<TTerminalInput>) => {
			if (settled) return;
			settled = true;
			for (const remove of removeAbortListeners) remove();
			if (killTimer !== undefined) timers.clearTimeout(killTimer);
			void cleanupRuntimeFiles(runtimeFiles).finally(() => resolve(result));
		};

		const terminateChild = () => {
			if (killRequested) return;
			killRequested = true;
			parser.markTerminating();
			updateEmitter.emit(updateFromSnapshot(parser.getSnapshot()), { force: true });
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
			updateEmitter.emit(updateFromSnapshot(snapshot));
			if ((snapshot.error || snapshot.protocolError) && !cancelled) {
				terminateChild();
			}
		});

		child.stderr?.on("data", (chunk) => {
			stderr.append(chunk);
		});

		child.on("error", (error) => {
			parser.markStopped();
			updateEmitter.emit(updateFromSnapshot(parser.getSnapshot()), { force: true });
			finish(errorResult(title, parser.getProgress(), `Failed to spawn subagent Pi process: ${error.message}`, error));
		});

		child.on("close", (code, closeSignal) => {
			closed = true;
			if (killTimer !== undefined) timers.clearTimeout(killTimer);
			parser.finish();
			const snapshot = parser.getSnapshot();
			updateEmitter.emit(updateFromSnapshot(snapshot), { force: true });

			void resolveClosedRunnerSubagentResult<TTerminalInput>({
				title,
				snapshot,
				code,
				closeSignal,
				stderr: stderr.toString(),
				cancelled,
				abortSignals,
				readRuntimeResult: dependencies.readRuntimeResult ?? readRuntimeResultFile,
				returnMode,
				...(runtimeFiles === undefined ? {} : { runtimeFiles }),
				terminalToolStatuses: new Map(terminalTools.map((tool) => [tool.name, tool.status] as const)),
			})
				.then((result) => withRunnerSubagentUsage(result, dependencies.readSessionFile ?? defaultReadSessionFile))
				.then(finish, (error: unknown) => {
					const progress = parser.getProgress();
					finish(errorResult(title, progress, `Failed to resolve subagent result: ${errorMessage(error)}`, error));
				});
		});
	});
}

export function buildChildPiArgs(input: BuildChildPiArgsInput): string[] {
	const args = ["--mode", "json", "-p"];
	if (input.model !== undefined) {
		args.push("--model", input.model);
	} else if (input.launch?.model !== undefined) {
		args.push("--provider", input.launch.model.provider, "--model", input.launch.model.id);
	}
	if (input.launch !== undefined && input.launch.thinkingLevel !== "off") {
		args.push("--thinking", input.launch.thinkingLevel);
	}
	args.push("--no-extensions");
	if (input.runtimeExtensionPath !== undefined) args.push("--extension", input.runtimeExtensionPath);
	args.push("--session", input.sessionFile, input.prompt);
	return args;
}

function runnerSubagentReturnMode(options: RunnerSubagentOptions): RunnerSubagentReturnMode {
	return options.returnMode ?? "terminal";
}

function runnerSubagentTerminalTools(options: RunnerSubagentOptions): readonly RunnerSubagentTerminalToolDefinition[] {
	return options.terminalTools ?? [];
}

export function resolveRunnerSubagentLaunch(
	pi: RunnerSubagentPi,
	ctx: RunnerSubagentContext,
	options: RunnerSubagentOptions,
): RunnerSubagentLaunchMetadata | undefined {
	const model = options.launch?.model ?? ctx.model;
	const hasThinkingSource = options.launch?.thinkingLevel !== undefined || pi.getThinkingLevel !== undefined;
	if (model === undefined && !hasThinkingSource) return undefined;
	const thinkingLevel = options.launch?.thinkingLevel ?? pi.getThinkingLevel?.() ?? "off";
	return {
		...(model === undefined ? {} : { model }),
		thinkingLevel,
		hasModelArg: model !== undefined,
		hasThinkingArg: thinkingLevel !== "off",
	};
}

function createUpdateEmitter(onProgress: ((update: RunnerSubagentUpdate) => void) | undefined): {
	emit(update: RunnerSubagentUpdate, options?: { force?: boolean }): void;
} {
	let lastSignature: string | undefined;
	return {
		emit(update: RunnerSubagentUpdate, options: { force?: boolean } = {}): void {
			if (!onProgress) return;
			const signature = updateSignature(update);
			if (options.force !== true && signature === lastSignature) return;
			lastSignature = signature;
			try {
				onProgress(update);
			} catch {
				// Progress display is best-effort and must not affect the child run.
			}
		},
	};
}

function updateFromProgress(progress: RunnerSubagentProgress): RunnerSubagentUpdate {
	return { progress, activity: emptyRunnerSubagentActivity() };
}

function updateFromSnapshot(snapshot: RunnerSubagentJsonEventParserSnapshot): RunnerSubagentUpdate {
	return { progress: snapshot.progress, activity: snapshot.activity };
}

function updateSignature(update: RunnerSubagentUpdate): string {
	return [
		update.progress.title ?? "",
		update.progress.state,
		update.progress.currentTool ?? "",
		String(update.progress.toolCount),
		String(update.progress.turnCount),
		update.progress.sessionFile ?? "",
		update.activity.assistantPreview ?? "",
		update.activity.currentToolInputPreview ?? "",
		update.activity.lastToolName ?? "",
		update.activity.lastToolResultPreview ?? "",
		String(update.activity.lastToolResultIsError ?? false),
	].join("\0");
}

export function resolvePiInvocation(args: string[], dependencies: RunnerSubagentDispatcherDependencies = {}): PiInvocation {
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

interface ResolveClosedRunnerSubagentResultInput {
	title: string | undefined;
	snapshot: RunnerSubagentJsonEventParserSnapshot;
	code: number | null;
	closeSignal: NodeJS.Signals | null;
	stderr: string;
	cancelled: boolean;
	abortSignals: readonly AbortSignal[];
	runtimeFiles?: RunnerSubagentRuntimeFiles;
	readRuntimeResult: ReadRunnerSubagentRuntimeResult;
	returnMode: RunnerSubagentReturnMode;
	terminalToolStatuses: ReadonlyMap<string, "completed" | "blocked">;
}

async function resolveClosedRunnerSubagentResult<TTerminalInput>(
	input: ResolveClosedRunnerSubagentResultInput,
): Promise<RunnerSubagentResult<TTerminalInput>> {
	const { title, snapshot } = input;
	const progress = snapshot.progress;

	if (input.cancelled) {
		return cancelledResult(title, progress, abortReason(input.abortSignals));
	}

	if (snapshot.error) {
		return errorResult(title, progress, snapshot.error.message, snapshot.error);
	}

	const runtimeRead: RuntimeResultReadOutcome = input.runtimeFiles
		? await readRuntimeResultOutcome(input.runtimeFiles.resultPath, input.readRuntimeResult)
		: {};
	if (runtimeRead.result?.kind === "runtime-error") {
		return errorResult(
			title,
			progress,
			`Subagent terminal runtime failed (${runtimeRead.result.code}): ${runtimeRead.result.message}`,
			new Error(runtimeRead.result.message),
		);
	}

	if (snapshot.protocolError) {
		return protocolErrorResult(title, progress, snapshot.protocolError.message, snapshot.protocolError.event);
	}

	if (input.code !== 0) {
		return errorResult(title, progress, nonzeroExitDiagnostic(input.code, input.closeSignal, input.stderr));
	}

	if (runtimeRead.failure) {
		if (snapshot.terminalAttempted) {
			return protocolErrorResult(
				title,
				progress,
				`Terminal tool was attempted, but the subagent runtime result sink was invalid: ${runtimeRead.failure.message}`,
				runtimeRead.failure,
			);
		}
		return errorResult(
			title,
			progress,
			`Failed to read subagent terminal runtime result: ${runtimeRead.failure.message}`,
			runtimeRead.failure.cause,
		);
	}

	if (runtimeRead.result?.kind === "terminal-capture") {
		const protocolDiagnostic = validateTerminalCapture(runtimeRead.result, input.terminalToolStatuses);
		if (protocolDiagnostic) {
			return protocolErrorResult(title, progress, protocolDiagnostic, runtimeRead.result);
		}
		return terminalCaptureResult<TTerminalInput>(title, progress, runtimeRead.result);
	}

	if (snapshot.stopReason === "error" || snapshot.stopReason === "aborted") {
		const message = snapshot.errorMessage ?? `Subagent stopped with stopReason ${snapshot.stopReason}.`;
		return errorResult(title, progress, message, new Error(message));
	}

	if (snapshot.terminalExecutionError) {
		return protocolErrorResult(title, progress, snapshot.terminalExecutionError.message, snapshot.terminalExecutionError.event);
	}

	if (snapshot.terminalAttempted) {
		return protocolErrorResult(
			title,
			progress,
			"Terminal tool was attempted, but no valid terminal capture was written by the subagent runtime.",
		);
	}

	if (input.returnMode === "final-text") {
		if (snapshot.finalAssistantText !== undefined) {
			return finalTextResult(title, progress, snapshot.finalAssistantText, snapshot.stopReason);
		}
		return stoppedWithoutUsefulTextResult(title, progress, snapshot.stopReason);
	}

	return stoppedWithoutTerminalResult(title, progress, snapshot.stopReason);
}

interface RuntimeResultReadOutcome {
	result?: RuntimeResultV1;
	failure?: RuntimeFailureData;
}

async function readRuntimeResultOutcome(
	resultPath: string,
	readRuntimeResult: ReadRunnerSubagentRuntimeResult,
): Promise<RuntimeResultReadOutcome> {
	const read = await readRuntimeResult(resultPath);
	switch (read.type) {
		case "missing":
			return {};
		case "loaded":
			return { result: read.result };
		case "invalid":
		case "read-error":
			return { failure: read.failure };
	}
}

function validateTerminalCapture(
	capture: Extract<RuntimeResultV1, { kind: "terminal-capture" }>,
	terminalToolStatuses: ReadonlyMap<string, "completed" | "blocked">,
): string | undefined {
	const expectedStatus = terminalToolStatuses.get(capture.toolName);
	if (!expectedStatus) return `Subagent runtime captured unknown terminal tool: ${capture.toolName}.`;
	if (expectedStatus !== capture.status) {
		return `Subagent runtime captured terminal tool ${capture.toolName} with unexpected status ${capture.status}; expected ${expectedStatus}.`;
	}
	return undefined;
}

function terminalCaptureResult<TTerminalInput>(
	title: string | undefined,
	progress: RunnerSubagentProgress,
	capture: Extract<RuntimeResultV1, { kind: "terminal-capture" }>,
): RunnerSubagentCompletedResult<TTerminalInput> | RunnerSubagentBlockedResult<TTerminalInput> {
	const terminal = {
		toolName: capture.toolName,
		...(capture.toolCallId === undefined ? {} : { toolCallId: capture.toolCallId }),
		status: capture.status,
		input: capture.input as TTerminalInput,
	};
	const base = {
		...(title === undefined ? {} : { title }),
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
	};
	if (capture.status === "completed") {
		return {
			...base,
			status: "completed",
			terminal: { ...terminal, status: "completed" },
		};
	}
	return {
		...base,
		status: "blocked",
		terminal: { ...terminal, status: "blocked" },
	};
}

async function createSessionFile(cwd: string, title: string | undefined, dependencies: RunnerSubagentDispatcherDependencies): Promise<string> {
	if (dependencies.createSessionFile) {
		return await dependencies.createSessionFile({ cwd, ...(title === undefined ? {} : { title }) });
	}
	return await createDefaultSessionFile();
}

async function createDefaultSessionFile(): Promise<string> {
	const root = join(tmpdir(), "pi-runner-subagents");
	await mkdir(root, { recursive: true, mode: 0o700 });
	const dir = await mkdtemp(join(root, "session-"));
	return join(dir, `${randomUUID()}.jsonl`);
}

function defaultSpawnChildProcess(command: string, args: string[], options: SpawnChildProcessOptions): SpawnedChildProcess {
	return nodeSpawn(command, args, options);
}

function defaultReadSessionFile(sessionFile: string): Promise<string> {
	return readFile(sessionFile, "utf8");
}

async function withRunnerSubagentUsage<TTerminalInput>(
	result: RunnerSubagentResult<TTerminalInput>,
	readSessionFile: ReadRunnerSubagentSessionFile,
): Promise<RunnerSubagentResult<TTerminalInput>> {
	const sessionFile = runnerSubagentSessionFile(result);
	let usage: RunnerSubagentUsageMetadata;
	try {
		usage = await readRunnerSubagentUsageFromSessionFile(sessionFile, readSessionFile);
	} catch (error) {
		usage = {
			status: "unavailable",
			source: "child-session-file",
			...(sessionFile === undefined ? {} : { sessionFile }),
			reason: "session-read-error",
			diagnostic: `Unexpected error while collecting subagent child session usage: ${errorMessage(error)}`,
		};
	}
	return { ...result, usage };
}

function finalTextResult(
	title: string | undefined,
	progress: RunnerSubagentProgress,
	finalText: string,
	stopReason: string | undefined,
): RunnerSubagentFinalTextResult {
	return {
		...(title === undefined ? {} : { title }),
		status: "final-text",
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		finalText,
		...(stopReason === undefined ? {} : { stopReason }),
	};
}

function stoppedWithoutTerminalResult(
	title: string | undefined,
	progress: RunnerSubagentProgress,
	stopReason: string | undefined,
): RunnerSubagentStoppedWithoutTerminalResult {
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

function stoppedWithoutUsefulTextResult(
	title: string | undefined,
	progress: RunnerSubagentProgress,
	stopReason: string | undefined,
): RunnerSubagentStoppedWithoutUsefulTextResult {
	return {
		...(title === undefined ? {} : { title }),
		status: "stopped-without-useful-text",
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		diagnostic: STOPPED_WITHOUT_USEFUL_TEXT_DIAGNOSTIC,
		...(stopReason === undefined ? {} : { stopReason }),
	};
}

function cancelledResult(
	title: string | undefined,
	progress: RunnerSubagentProgress,
	reason: string | undefined,
): RunnerSubagentCancelledResult {
	return {
		...(title === undefined ? {} : { title }),
		status: "cancelled",
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		diagnostic: "Subagent cancelled by parent abort signal.",
		...(reason === undefined ? {} : { reason }),
	};
}

function errorResult(
	title: string | undefined,
	progress: RunnerSubagentProgress,
	diagnostic: string,
	error: unknown = new Error(diagnostic),
): RunnerSubagentErrorResult {
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

function protocolErrorResult(
	title: string | undefined,
	progress: RunnerSubagentProgress,
	message: string,
	event?: unknown,
): RunnerSubagentProtocolErrorResult {
	return {
		...(title === undefined ? {} : { title }),
		status: "protocol-error",
		elapsedMs: progress.elapsedMs,
		progress,
		...(progress.sessionFile === undefined ? {} : { sessionFile: progress.sessionFile }),
		diagnostic: message,
		protocolError: {
			message,
			...(event === undefined ? {} : { event }),
		},
	};
}

async function cleanupRuntimeFiles(runtimeFiles: RunnerSubagentRuntimeFiles | undefined): Promise<void> {
	if (runtimeFiles === undefined) return;
	try {
		await runtimeFiles.cleanup?.();
	} catch {
		// Best-effort cleanup must never change the subagent result.
	}
}

function stoppedProgress(input: {
	title: string | undefined;
	now: () => number;
	startTimeMs: number;
	sessionFile?: string;
	launch?: RunnerSubagentLaunchMetadata;
}): RunnerSubagentProgress {
	const elapsedMs = Math.max(0, input.now() - input.startTimeMs);
	return {
		...(input.title === undefined ? {} : { title: input.title }),
		state: "stopped",
		toolCount: 0,
		turnCount: 0,
		elapsedMs,
		...(input.sessionFile === undefined ? {} : { sessionFile: input.sessionFile }),
		...(input.launch === undefined ? {} : { launch: input.launch }),
	};
}

function errorPayload(error: unknown, fallbackMessage: string): RunnerSubagentErrorResult["error"] {
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
	return `Subagent Pi exited ${exitText}${signalText}.${stderrText}`;
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
	private readonly limitBytes: number;
	private value = "";
	private omittedBytes = 0;

	constructor(limitBytes: number) {
		this.limitBytes = limitBytes;
	}

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
