/**
 * Real Pi child-session adapter for the Objective Runner.
 *
 * Spawns the `pi` binary in `--mode json` print mode and parses its NDJSON
 * stdout into the runner's minimal `ChildSessionEvent` vocabulary. This module
 * deliberately has ZERO `@sdl/pi` imports: it is reachable from the jiti-loaded
 * `@sdl/objective/sdl/commands/exec-runner-step` repo-local command, and
 * `@sdl/pi` is an optional peer that must never enter that transpile graph.
 * Consumers must import this module by its concrete path, never via the
 * `src/pi/index.ts` barrel (the barrel re-exports `extension.ts` → `@sdl/pi`).
 */
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatErrorMessage, isRecord } from "@sdl/core/primitives";
import { systemTimerScheduler } from "@sdl/core/time";
import type { ScheduledTimer, TimerScheduler } from "@sdl/core/timers";

import type {
	ChildSessionEvent,
	ChildSessionGateway,
	ChildSessionHandle,
	ChildSessionOutcome,
	ChildSessionRequest,
} from "../../runner/child-session.ts";
import { createEventChannel, type EventChannel } from "../../runner/event-channel.ts";

export const SDL_RUNNER_PI_BIN_ENV = "SDL_RUNNER_PI_BIN";

const DEFAULT_STDERR_TAIL_LIMIT_BYTES = 8 * 1024;
const DEFAULT_SIGKILL_GRACE_MS = 10_000;
const ASSISTANT_ACTIVITY_PREVIEW_CHARS = 120;

export interface PiChildSpawnOptions {
	cwd: string;
	shell: false;
	stdio: ["ignore", "pipe", "pipe"];
}

export interface PiChildDataStream {
	on(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
}

export interface SpawnedPiChildProcess {
	stdout?: PiChildDataStream | null;
	stderr?: PiChildDataStream | null;
	kill(signal?: NodeJS.Signals | number): boolean;
	on(
		event: "close",
		listener: (code: number | null, signal: NodeJS.Signals | null) => void,
	): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
}

export type SpawnPiChildProcess = (
	command: string,
	args: string[],
	options: PiChildSpawnOptions,
) => SpawnedPiChildProcess;

export interface PiChildSessionGatewayDependencies {
	/** Host environment; `SDL_RUNNER_PI_BIN` overrides the `pi` binary. */
	env: Record<string, string | undefined>;
	spawn?: SpawnPiChildProcess;
	timers?: TimerScheduler;
	/** Test seam for the temp directory holding the child session JSONL. */
	createSessionDir?: () => Promise<string>;
	stderrTailLimitBytes?: number;
	sigkillGraceMs?: number;
}

/**
 * Creates the real `ChildSessionGateway`: spawns
 * `pi --mode json -p [--model <m>] --session <file> <prompt>` in the request
 * cwd as a full dev session (no `--no-extensions`), streams salient NDJSON
 * events as `activity` lines, and resolves the outcome on process close.
 * The outcome never rejects; every failure mode is an outcome variant.
 */
export function createPiChildSessionGateway(
	deps: PiChildSessionGatewayDependencies,
): ChildSessionGateway {
	return {
		dispatch(request: ChildSessionRequest): ChildSessionHandle {
			const channel = createEventChannel<ChildSessionEvent>();
			return { events: channel.iterable, outcome: runPiChildSession(deps, request, channel) };
		},
	};
}

async function runPiChildSession(
	deps: PiChildSessionGatewayDependencies,
	request: ChildSessionRequest,
	channel: EventChannel<ChildSessionEvent>,
): Promise<ChildSessionOutcome> {
	let isChannelClosed = false;
	const emit = (event: ChildSessionEvent) => {
		if (!isChannelClosed) channel.push(event);
	};
	const closeChannel = () => {
		if (isChannelClosed) return;
		isChannelClosed = true;
		channel.close();
	};

	let sessionFile: string;
	try {
		const sessionDir = await (deps.createSessionDir ?? createDefaultSessionDir)();
		sessionFile = join(sessionDir, "child-session.jsonl");
	} catch (error) {
		closeChannel();
		return {
			type: "startup-failed",
			message: `Failed to create child session directory: ${formatErrorMessage(error)}`,
		};
	}

	const command = deps.env[SDL_RUNNER_PI_BIN_ENV] ?? "pi";
	const spawnPiChildProcess = deps.spawn ?? defaultSpawnPiChildProcess;
	let child: SpawnedPiChildProcess;
	try {
		child = spawnPiChildProcess(command, buildPiChildArgs(request, sessionFile), {
			cwd: request.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		closeChannel();
		return {
			type: "startup-failed",
			message: `Failed to spawn Pi child process: ${formatErrorMessage(error)}`,
		};
	}

	const timers = deps.timers ?? systemTimerScheduler;
	const sigkillGraceMs = deps.sigkillGraceMs ?? DEFAULT_SIGKILL_GRACE_MS;
	const stderrTail = new BoundedTextBuffer(
		deps.stderrTailLimitBytes ?? DEFAULT_STDERR_TAIL_LIMIT_BYTES,
	);
	const parser = createPiJsonActivityParser((line) => emit({ type: "activity", line }));

	return await new Promise<ChildSessionOutcome>((resolve) => {
		let settled = false;
		let closed = false;
		let timedOut = false;
		let timeoutTimer: ScheduledTimer | undefined;
		let killTimer: ScheduledTimer | undefined;

		const finish = (outcome: ChildSessionOutcome) => {
			if (settled) return;
			settled = true;
			timeoutTimer?.cancel();
			killTimer?.cancel();
			closeChannel();
			resolve(outcome);
		};

		if (request.timeoutMs !== undefined) {
			timeoutTimer = timers.setTimeout(() => {
				timedOut = true;
				child.kill("SIGTERM");
				killTimer = timers.setTimeout(() => {
					if (!closed) child.kill("SIGKILL");
				}, sigkillGraceMs);
			}, request.timeoutMs);
		}

		child.stdout?.on("data", (chunk) => {
			parser.pushChunk(chunk);
		});

		child.stderr?.on("data", (chunk) => {
			const text = chunkToString(chunk);
			stderrTail.append(text);
			emit({ type: "stderr", text });
		});

		child.on("error", (error) => {
			finish({
				type: "startup-failed",
				message: `Failed to spawn Pi child process: ${error.message}`,
			});
		});

		child.on("close", (code) => {
			closed = true;
			parser.flush();
			if (timedOut) {
				finish({ type: "timed-out", stderrTail: stderrTail.toString(), sessionFile });
				return;
			}
			const stopReason = parser.stopReason();
			finish({
				type: "completed",
				// A close without an exit code means a signal kill we did not
				// request; surface it as a nonzero sentinel (malfunction path).
				exitCode: code ?? -1,
				finalText: parser.finalAssistantText() ?? "",
				stderrTail: stderrTail.toString(),
				...(stopReason === undefined ? {} : { stopReason }),
				sessionFile,
			});
		});
	});
}

function buildPiChildArgs(request: ChildSessionRequest, sessionFile: string): string[] {
	const args = ["--mode", "json", "-p"];
	if (request.model !== undefined) args.push("--model", request.model);
	// Session-backed so runner usage facts can be read from the JSONL after the
	// run. No --no-extensions: the child is a full dev session.
	args.push("--session", sessionFile, request.prompt);
	return args;
}

async function createDefaultSessionDir(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "sdl-objective-runner-"));
}

function defaultSpawnPiChildProcess(
	command: string,
	args: string[],
	options: PiChildSpawnOptions,
): SpawnedPiChildProcess {
	return spawn(command, args, options);
}

interface PiJsonActivityParser {
	pushChunk(chunk: string | Uint8Array): void;
	/** Processes any trailing unterminated line; call once on process close. */
	flush(): void;
	finalAssistantText(): string | undefined;
	stopReason(): string | undefined;
}

/**
 * Tolerant NDJSON line parser over Pi `--mode json` stdout.
 *
 * Salient events become human-oriented `activity` lines; unknown event types
 * are skipped and non-JSON lines are forwarded verbatim so nothing observable
 * is lost. Tracks the last assistant message text (which carries the runner
 * report block) and the last assistant `stopReason`.
 */
function createPiJsonActivityParser(emitActivity: (line: string) => void): PiJsonActivityParser {
	let buffer = "";
	let turnCount = 0;
	let finalAssistantText: string | undefined;
	let stopReason: string | undefined;

	function captureFromMessage(message: unknown, options: { finalText: boolean }): void {
		if (!isRecord(message) || message.role !== "assistant") return;
		if (typeof message.stopReason === "string" && message.stopReason.length > 0) {
			stopReason = message.stopReason;
		}
		if (!options.finalText) return;
		const text = assistantTextFromContent(message.content);
		if (text !== undefined) finalAssistantText = text;
	}

	function processEvent(eventType: string, event: Record<string, unknown>): void {
		switch (eventType) {
			case "agent_start":
				emitActivity("agent started");
				return;
			case "turn_start":
				turnCount += 1;
				emitActivity(`turn ${turnCount} started`);
				return;
			case "message_start":
			case "message_update":
				captureFromMessage(event.message, { finalText: false });
				return;
			case "turn_end":
				captureFromMessage(event.message, { finalText: true });
				return;
			case "message_end": {
				captureFromMessage(event.message, { finalText: true });
				const preview = assistantActivityPreview(event.message);
				if (preview !== undefined) emitActivity(preview);
				return;
			}
			case "agent_end": {
				if (Array.isArray(event.messages)) {
					for (const message of event.messages) captureFromMessage(message, { finalText: true });
				}
				emitActivity(
					stopReason === undefined ? "agent finished" : `agent finished (${stopReason})`,
				);
				return;
			}
			case "tool_execution_start":
				if (typeof event.toolName === "string") emitActivity(`tool ${event.toolName} started`);
				return;
			case "tool_execution_end":
				if (typeof event.toolName === "string") {
					emitActivity(`tool ${event.toolName} ${event.isError === true ? "failed" : "completed"}`);
				}
				return;
			default:
				// Unknown event types are tolerated: the vocabulary may grow.
				return;
		}
	}

	function processLine(rawLine: string): void {
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		if (line.trim().length === 0) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			// Tolerant passthrough: stray non-JSON stdout stays observable.
			emitActivity(line);
			return;
		}
		if (!isRecord(parsed) || typeof parsed.type !== "string") return;
		processEvent(parsed.type, parsed);
	}

	return {
		pushChunk(chunk) {
			buffer += chunkToString(chunk);
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) processLine(line);
		},
		flush() {
			if (buffer.trim().length > 0) processLine(buffer);
			buffer = "";
		},
		finalAssistantText: () => finalAssistantText,
		stopReason: () => stopReason,
	};
}

function assistantActivityPreview(message: unknown): string | undefined {
	if (!isRecord(message) || message.role !== "assistant") return undefined;
	const text = assistantTextFromContent(message.content);
	if (text === undefined) return undefined;
	const firstLine = text.split("\n", 1)[0] ?? "";
	const truncated =
		firstLine.length > ASSISTANT_ACTIVITY_PREVIEW_CHARS
			? `${firstLine.slice(0, ASSISTANT_ACTIVITY_PREVIEW_CHARS)}…`
			: firstLine;
	return truncated.length === 0 ? undefined : `assistant: ${truncated}`;
}

function assistantTextFromContent(content: unknown): string | undefined {
	if (!Array.isArray(content)) return undefined;
	const textBlocks: string[] = [];
	for (const block of content) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
		textBlocks.push(block.text);
	}
	const text = textBlocks.join("\n\n").trim();
	return text.length > 0 ? text : undefined;
}

function chunkToString(chunk: string | Uint8Array): string {
	return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
}

class BoundedTextBuffer {
	private readonly limitBytes: number;
	private value = "";
	private omittedBytes = 0;

	constructor(limitBytes: number) {
		this.limitBytes = limitBytes;
	}

	append(chunk: string): void {
		this.value += chunk;
		const bytes = Buffer.byteLength(this.value, "utf8");
		if (bytes <= this.limitBytes) return;

		const encoded = Buffer.from(this.value, "utf8");
		const tail = encoded.subarray(encoded.length - this.limitBytes);
		this.omittedBytes += encoded.length - tail.length;
		this.value = tail.toString("utf8");
	}

	toString(): string {
		if (this.omittedBytes === 0) return this.value;
		return `… ${this.omittedBytes} stderr byte(s) omitted\n${this.value}`;
	}
}
