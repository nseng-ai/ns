/**
 * ADR0024-LEGACY-DELETE(whole file, with its parent directory): the Pi
 * subprocess adapter exists only for the legacy blocking `runner-step`; the
 * decomposed flow dispatches a harness subagent instead (ADR 0024).
 *
 * Real Pi child-session adapter for the Objective Runner.
 *
 * Spawns the `pi` binary in `--mode json` print mode and parses its NDJSON
 * stdout into the runner's minimal `ChildSessionEvent` vocabulary. This module
 * deliberately has ZERO `@ns/pi` imports: it is reachable from the jiti-loaded
 * `@ns/objective/ns/commands/exec-runner-step` repo-local command, and
 * `@ns/pi` is an optional peer that must never enter that transpile graph.
 * Consumers must import this module by its concrete path, never via the
 * `src/pi/index.ts` barrel (the barrel re-exports `extension.ts` → `@ns/pi`).
 */
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Clock } from "@ns/core/clock";
import { formatErrorMessage, isRecord } from "@ns/core/primitives";
import { BoundedTextTailBuffer } from "@ns/core/text-tail-buffer";
import { systemClock, systemTimerScheduler } from "@ns/core/time";
import type { ScheduledTimer, TimerScheduler } from "@ns/core/timers";

import type {
	ChildSessionEvent,
	ChildSessionGateway,
	ChildSessionHandle,
	ChildSessionOutcome,
	ChildSessionRequest,
} from "../../runner/child-session.ts";
import { createEventChannel, type EventChannel } from "../../runner/event-channel.ts";

export const SDL_RUNNER_PI_BIN_ENV = "NS_RUNNER_PI_BIN";

const DEFAULT_STDERR_TAIL_LIMIT_BYTES = 8 * 1024;
const DEFAULT_SIGKILL_GRACE_MS = 10_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const ACTIVITY_PREVIEW_CHARS = 120;

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
	/** Host environment; `NS_RUNNER_PI_BIN` overrides the `pi` binary. */
	env: Record<string, string | undefined>;
	spawn?: SpawnPiChildProcess;
	clock?: Clock;
	timers?: TimerScheduler;
	/** Test seam for the temp directory holding the child session JSONL. */
	createSessionDir?: () => Promise<string>;
	stderrTailLimitBytes?: number;
	sigkillGraceMs?: number;
	/** Cadence of the `still running` summary line while the child is alive. */
	heartbeatIntervalMs?: number;
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
	const clock = deps.clock ?? systemClock;
	const startMs = clock.nowMs();
	const emitElapsedLine = (line: string) => {
		emit({ type: "activity", line: `${formatElapsedSince(startMs, clock.nowMs())} ${line}` });
	};
	// Heartbeats read this but do not update it: `last:` must always name real
	// child activity, never a prior heartbeat.
	let lastActivity: { line: string; atMs: number } | undefined;
	const emitActivity = (line: string) => {
		lastActivity = { line, atMs: clock.nowMs() };
		emitElapsedLine(line);
	};

	let sessionFile: string;
	try {
		const sessionDir = await (deps.createSessionDir ?? createDefaultSessionDir)();
		sessionFile = join(sessionDir, "child-session.jsonl");
	} catch (error) {
		closeChannel();
		return startupFailed("Failed to create child session directory", error);
	}

	// Elapsed-prefixed but deliberately not `lastActivity`: heartbeats should
	// report "no activity yet" until the child itself produces something.
	emitElapsedLine(`child session: ${sessionFile}`);

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
		return startupFailed("Failed to spawn Pi child process", error);
	}

	const timers = deps.timers ?? systemTimerScheduler;
	const sigkillGraceMs = deps.sigkillGraceMs ?? DEFAULT_SIGKILL_GRACE_MS;
	const stderrTail = new BoundedTextTailBuffer({
		maxBytes: deps.stderrTailLimitBytes ?? DEFAULT_STDERR_TAIL_LIMIT_BYTES,
		omissionLabel: "stderr",
	});
	const parser = createPiJsonActivityParser(emitActivity);

	return await new Promise<ChildSessionOutcome>((resolve) => {
		let isSettled = false;
		let isClosed = false;
		let isTimedOut = false;
		let timeoutTimer: ScheduledTimer | undefined;
		let killTimer: ScheduledTimer | undefined;

		const heartbeatTimer = timers.setInterval(() => {
			emitElapsedLine(renderHeartbeatLine(parser.stats(), lastActivity, clock.nowMs()));
		}, deps.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);

		const finish = (outcome: ChildSessionOutcome) => {
			if (isSettled) return;
			isSettled = true;
			timeoutTimer?.cancel();
			killTimer?.cancel();
			heartbeatTimer.cancel();
			closeChannel();
			resolve(outcome);
		};

		if (request.timeoutMs !== undefined) {
			timeoutTimer = timers.setTimeout(() => {
				isTimedOut = true;
				child.kill("SIGTERM");
				killTimer = timers.setTimeout(() => {
					if (!isClosed) child.kill("SIGKILL");
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
			finish(startupFailed("Failed to spawn Pi child process", error));
		});

		child.on("close", (code, signal) => {
			isClosed = true;
			parser.flush();
			if (isTimedOut) {
				finish({ type: "timed-out", stderrTail: stderrTail.toString(), sessionFile });
				return;
			}
			if (code === null) {
				finish({ type: "signaled", signal, stderrTail: stderrTail.toString(), sessionFile });
				return;
			}
			const stopReason = parser.stopReason();
			finish({
				type: "completed",
				exitCode: code,
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
	return await mkdtemp(join(tmpdir(), "ns-objective-runner-"));
}

function startupFailed(context: string, error: unknown): ChildSessionOutcome {
	return { type: "startup-failed", message: `${context}: ${formatErrorMessage(error)}` };
}

function defaultSpawnPiChildProcess(
	command: string,
	args: string[],
	options: PiChildSpawnOptions,
): SpawnedPiChildProcess {
	return spawn(command, args, options);
}

interface PiSessionActivityStats {
	turnCount: number;
	toolCallCount: number;
	toolFailureCount: number;
}

interface PiJsonActivityParser {
	pushChunk(chunk: string | Uint8Array): void;
	/** Processes any trailing unterminated line; call once on process close. */
	flush(): void;
	finalAssistantText(): string | undefined;
	stopReason(): string | undefined;
	/** Running aggregate over salient events; feeds the heartbeat line. */
	stats(): PiSessionActivityStats;
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
	let toolCallCount = 0;
	let toolFailureCount = 0;
	let finalAssistantText: string | undefined;
	let stopReason: string | undefined;
	let currentMessageHadBlockPreview = false;
	const messageIdsWithBlockPreview = new Set<string>();

	function captureFromMessage(
		message: unknown,
		options: { shouldCaptureFinalText: boolean },
	): void {
		if (!isRecord(message) || message.role !== "assistant") return;
		if (typeof message.stopReason === "string" && message.stopReason.length > 0) {
			stopReason = message.stopReason;
		}
		if (!options.shouldCaptureFinalText) return;
		const text = assistantTextFromContent(message.content);
		if (text !== undefined) finalAssistantText = text;
	}

	function markBlockPreviewEmitted(message: unknown): void {
		const messageId = messageIdFromMessage(message);
		if (messageId === undefined) {
			currentMessageHadBlockPreview = true;
			return;
		}
		messageIdsWithBlockPreview.add(messageId);
	}

	function hasBlockPreviewForMessage(message: unknown): boolean {
		const messageId = messageIdFromMessage(message);
		if (messageId === undefined) return currentMessageHadBlockPreview;
		return messageIdsWithBlockPreview.has(messageId);
	}

	function processMessageUpdate(event: Record<string, unknown>): void {
		captureFromMessage(event.message, { shouldCaptureFinalText: false });
		const assistantMessageEvent = event.assistantMessageEvent;
		if (!isRecord(assistantMessageEvent)) return;
		const preview = blockEndActivityPreview(assistantMessageEvent);
		if (preview === undefined) return;
		emitActivity(preview.line);
		markBlockPreviewEmitted(preview.message);
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
				currentMessageHadBlockPreview = false;
				captureFromMessage(event.message, { shouldCaptureFinalText: false });
				return;
			case "message_update":
				processMessageUpdate(event);
				return;
			case "turn_end":
				captureFromMessage(event.message, { shouldCaptureFinalText: true });
				return;
			case "message_end": {
				captureFromMessage(event.message, { shouldCaptureFinalText: true });
				if (!hasBlockPreviewForMessage(event.message)) {
					const preview = assistantActivityPreview(event.message);
					if (preview !== undefined) emitActivity(preview);
				}
				currentMessageHadBlockPreview = false;
				return;
			}
			case "agent_end": {
				if (Array.isArray(event.messages)) {
					for (const message of event.messages) {
						captureFromMessage(message, { shouldCaptureFinalText: true });
					}
				}
				emitActivity(
					stopReason === undefined ? "agent finished" : `agent finished (${stopReason})`,
				);
				return;
			}
			case "tool_execution_start":
				if (typeof event.toolName === "string") {
					toolCallCount += 1;
					const summary = toolArgumentSummary(event.args);
					emitActivity(
						summary === undefined
							? `tool ${event.toolName} started`
							: `tool ${event.toolName}: ${summary}`,
					);
				}
				return;
			case "tool_execution_end":
				if (typeof event.toolName === "string") {
					if (event.isError === true) {
						toolFailureCount += 1;
						const preview = toolFailurePreview(event.result);
						emitActivity(
							preview === undefined
								? `tool ${event.toolName} failed`
								: `tool ${event.toolName} failed: ${preview}`,
						);
						return;
					}
					emitActivity(`tool ${event.toolName} completed`);
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
		stats: () => ({ turnCount, toolCallCount, toolFailureCount }),
	};
}

interface BlockEndActivityPreview {
	line: string;
	message: unknown;
}

function blockEndActivityPreview(
	assistantMessageEvent: Record<string, unknown>,
): BlockEndActivityPreview | undefined {
	const contentIndex = assistantMessageEvent.contentIndex;
	if (typeof contentIndex !== "number" || !Number.isInteger(contentIndex) || contentIndex < 0) {
		return undefined;
	}
	const partial = assistantMessageEvent.partial;
	if (!isRecord(partial) || !Array.isArray(partial.content)) return undefined;
	const block = partial.content[contentIndex];
	if (!isRecord(block)) return undefined;
	if (assistantMessageEvent.type === "thinking_end") {
		if (block.type !== "thinking" || typeof block.thinking !== "string") return undefined;
		const preview = firstLinePreview(block.thinking);
		return preview === undefined ? undefined : { line: `thinking: ${preview}`, message: partial };
	}
	if (assistantMessageEvent.type === "text_end") {
		if (block.type !== "text" || typeof block.text !== "string") return undefined;
		const preview = firstLinePreview(block.text);
		return preview === undefined ? undefined : { line: `assistant: ${preview}`, message: partial };
	}
	return undefined;
}

function assistantActivityPreview(message: unknown): string | undefined {
	if (!isRecord(message) || message.role !== "assistant") return undefined;
	const text = assistantTextFromContent(message.content);
	if (text === undefined) return undefined;
	const preview = firstLinePreview(text);
	return preview === undefined ? undefined : `assistant: ${preview}`;
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

function toolArgumentSummary(args: unknown): string | undefined {
	if (typeof args === "string") return inlinePreview(args);
	if (!isRecord(args)) return undefined;

	for (const key of ["command", "path", "file_path", "filePath", "pattern", "query", "url"]) {
		const value = args[key];
		if (typeof value !== "string") continue;
		const preview = inlinePreview(value);
		if (preview !== undefined) return preview;
	}

	for (const value of Object.values(args)) {
		if (typeof value !== "string") continue;
		const preview = inlinePreview(value);
		if (preview !== undefined) return preview;
	}

	const jsonPreview = compactJsonPreview(args);
	return jsonPreview === undefined ? undefined : inlinePreview(jsonPreview);
}

function toolFailurePreview(result: unknown): string | undefined {
	if (typeof result === "string") return firstLinePreview(result);
	if (!isRecord(result)) return undefined;
	const contentText = textFromContentBlocks(result.content);
	if (contentText !== undefined) return firstLinePreview(contentText);
	for (const key of ["message", "error", "stderr", "text"]) {
		const value = result[key];
		if (typeof value !== "string") continue;
		const preview = firstLinePreview(value);
		if (preview !== undefined) return preview;
	}
	return undefined;
}

function textFromContentBlocks(content: unknown): string | undefined {
	if (!Array.isArray(content)) return undefined;
	const textBlocks: string[] = [];
	for (const block of content) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
		textBlocks.push(block.text);
	}
	const text = textBlocks.join("\n").trim();
	return text.length > 0 ? text : undefined;
}

function messageIdFromMessage(message: unknown): string | undefined {
	if (!isRecord(message) || typeof message.id !== "string" || message.id.length === 0)
		return undefined;
	return message.id;
}

function compactJsonPreview(value: unknown): string | undefined {
	let json: string;
	try {
		json = JSON.stringify(value);
	} catch {
		return undefined;
	}
	if (json === undefined || json.length === 0 || json.length > ACTIVITY_PREVIEW_CHARS) {
		return undefined;
	}
	return json;
}

function firstLinePreview(text: string): string | undefined {
	for (const line of text.split(/\r?\n/u)) {
		const preview = inlinePreview(line);
		if (preview !== undefined) return preview;
	}
	return undefined;
}

function inlinePreview(text: string): string | undefined {
	const normalized = text.trim().replace(/\s+/gu, " ");
	if (normalized.length === 0) return undefined;
	return normalized.length > ACTIVITY_PREVIEW_CHARS
		? `${normalized.slice(0, ACTIVITY_PREVIEW_CHARS)}…`
		: normalized;
}

/**
 * Renders the periodic liveness summary: aggregate progress counters plus the
 * age of the most recent real activity line, so a tailing observer can tell a
 * quietly working child (fresh `last:`) from a stuck one (aging `last:`).
 */
function renderHeartbeatLine(
	stats: PiSessionActivityStats,
	lastActivity: { line: string; atMs: number } | undefined,
	nowMs: number,
): string {
	const turnPart = stats.turnCount === 0 ? "no turns yet" : `turn ${stats.turnCount}`;
	const failurePart = stats.toolFailureCount === 0 ? "" : ` (${stats.toolFailureCount} failed)`;
	const lastPart =
		lastActivity === undefined
			? "no activity yet"
			: `last: ${lastActivity.line} (${formatDuration(nowMs - lastActivity.atMs)} ago)`;
	return `still running — ${turnPart}, ${stats.toolCallCount} tool calls${failurePart}, ${lastPart}`;
}

function formatElapsedSince(startMs: number, nowMs: number): string {
	return `[+${formatDuration(nowMs - startMs)}]`;
}

function formatDuration(durationMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
	if (totalSeconds < 60) return `${totalSeconds}s`;
	if (totalSeconds < 3_600) {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m${seconds}s`;
	}
	const hours = Math.floor(totalSeconds / 3_600);
	const minutes = Math.floor((totalSeconds % 3_600) / 60);
	return `${hours}h${minutes.toString().padStart(2, "0")}m`;
}

function chunkToString(chunk: string | Uint8Array): string {
	return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
}
