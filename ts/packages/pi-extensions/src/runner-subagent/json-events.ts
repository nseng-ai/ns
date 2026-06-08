import type { ThinkingLevel } from "../cmux/types.ts";
import type { RunnerSubagentLaunchMetadata, RunnerSubagentProgress } from "../runner-subagent.ts";
import type { RunnerSubagentActivity } from "./activity.ts";
import {
	assistantVisibleTextFromMessage,
	emptyRunnerSubagentActivity,
	toolInputPreviewFromEvent,
	toolResultPreviewFromEvent,
} from "./activity.ts";

export interface RunnerSubagentJsonEventParserOptions {
	title?: string;
	sessionFile?: string;
	now?: () => number;
	startTimeMs?: number;
	terminalToolNames?: Iterable<string>;
	launch?: RunnerSubagentLaunchMetadata;
}

export interface RunnerSubagentJsonSessionHeader {
	type: "session";
	version?: number;
	id?: string;
	timestamp?: string;
	cwd?: string;
	[key: string]: unknown;
}

export interface RunnerSubagentJsonProtocolError {
	message: string;
	event?: unknown;
}

export interface RunnerSubagentJsonTerminalExecutionError {
	message: string;
	toolName: string;
	toolCallId?: string;
	event?: unknown;
}

export interface RunnerSubagentJsonEventParserSnapshot {
	progress: RunnerSubagentProgress;
	activity: RunnerSubagentActivity;
	terminalAttempted: boolean;
	sessionHeader?: RunnerSubagentJsonSessionHeader;
	stopReason?: string;
	errorMessage?: string;
	finalAssistantText?: string;
	error?: RunnerSubagentJsonEventParserError;
	protocolError?: RunnerSubagentJsonProtocolError;
	terminalExecutionError?: RunnerSubagentJsonTerminalExecutionError;
}

export class RunnerSubagentJsonEventParserError extends Error {
	readonly line: string;
	readonly cause: unknown;

	constructor(message: string, line: string, cause: unknown) {
		super(message);
		this.name = "RunnerSubagentJsonEventParserError";
		this.line = line;
		this.cause = cause;
	}
}

type ParserState = RunnerSubagentProgress["state"];

export type JsonRecord = Record<string, unknown>;

interface JsonEvent {
	type: string;
	[key: string]: unknown;
}

export class RunnerSubagentJsonEventParser {
	private readonly title: string | undefined;
	private readonly now: () => number;
	private readonly startTimeMs: number;
	private readonly terminalToolNames: Set<string>;
	private launch: RunnerSubagentLaunchMetadata | undefined;
	private buffer = "";
	private state: ParserState = "starting";
	private currentTool: string | undefined;
	private currentToolCallId: string | undefined;
	private executedToolCount = 0;
	private turnCount = 0;
	private sessionFile: string | undefined;
	private sessionHeader: RunnerSubagentJsonSessionHeader | undefined;
	private stopReason: string | undefined;
	private errorMessage: string | undefined;
	private finalAssistantText: string | undefined;
	private activity: RunnerSubagentActivity = emptyRunnerSubagentActivity();
	private parseError: RunnerSubagentJsonEventParserError | undefined;
	private terminalAttempted = false;
	private protocolError: RunnerSubagentJsonProtocolError | undefined;
	private terminalExecutionError: RunnerSubagentJsonTerminalExecutionError | undefined;
	private currentTurnToolStarts: Array<{ toolName: string; toolCallId?: string }> = [];

	constructor(options: RunnerSubagentJsonEventParserOptions = {}) {
		this.title = options.title;
		this.now = options.now ?? Date.now;
		this.startTimeMs = options.startTimeMs ?? this.now();
		this.terminalToolNames = new Set(options.terminalToolNames ?? []);
		this.launch = cloneLaunchMetadata(options.launch);
		this.sessionFile = options.sessionFile;
	}

	pushChunk(chunk: string | Uint8Array): void {
		if (this.parseError) return;
		this.buffer += chunkToString(chunk);
		const lines = this.buffer.split("\n");
		this.buffer = lines.pop() ?? "";
		for (const line of lines) {
			this.processLine(line);
			if (this.parseError) return;
		}
	}

	finish(): void {
		if (!this.parseError && this.buffer.trim().length > 0) {
			this.processLine(this.buffer);
		}
		this.buffer = "";
		this.markStopped();
	}

	markTerminating(): void {
		if (this.state === "stopped") return;
		this.state = "terminating";
	}

	markStopped(): void {
		this.state = "stopped";
		this.currentTool = undefined;
		this.currentToolCallId = undefined;
	}

	getSnapshot(): RunnerSubagentJsonEventParserSnapshot {
		const snapshot: RunnerSubagentJsonEventParserSnapshot = {
			progress: this.getProgress(),
			activity: { ...this.activity },
			terminalAttempted: this.terminalAttempted,
		};
		if (this.sessionHeader) snapshot.sessionHeader = this.sessionHeader;
		if (this.stopReason) snapshot.stopReason = this.stopReason;
		if (this.errorMessage) snapshot.errorMessage = this.errorMessage;
		if (this.finalAssistantText !== undefined) snapshot.finalAssistantText = this.finalAssistantText;
		if (this.parseError) snapshot.error = this.parseError;
		if (this.protocolError) snapshot.protocolError = this.protocolError;
		if (this.terminalExecutionError) snapshot.terminalExecutionError = this.terminalExecutionError;
		return snapshot;
	}

	getProgress(): RunnerSubagentProgress {
		return {
			...(this.title === undefined ? {} : { title: this.title }),
			state: this.state,
			...(this.currentTool === undefined ? {} : { currentTool: this.currentTool }),
			toolCount: this.executedToolCount,
			turnCount: this.turnCount,
			elapsedMs: this.elapsedMs(),
			...(this.sessionFile === undefined ? {} : { sessionFile: this.sessionFile }),
			...(this.launch === undefined ? {} : { launch: this.launch }),
		};
	}

	private processLine(rawLine: string): void {
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		if (line.trim().length === 0) return;

		let event: unknown;
		try {
			event = JSON.parse(line);
		} catch (error) {
			this.fail(line, error);
			return;
		}

		if (!isJsonEvent(event)) {
			this.fail(line, new Error("JSONL event must be an object with a string type."));
			return;
		}

		this.processEvent(event);
	}

	private processEvent(event: JsonEvent): void {
		switch (event.type) {
			case "session":
				this.captureSessionHeader(event);
				return;
			case "model_change":
				this.captureModelChange(event);
				return;
			case "thinking_level_change":
				this.captureThinkingLevelChange(event);
				return;
			case "agent_start":
				this.state = "running";
				return;
			case "agent_end":
				this.captureAssistantPreviewFromMessages(event.messages);
				this.captureStopReasonFromMessages(event.messages);
				this.captureFinalAssistantTextFromMessages(event.messages);
				this.markStopped();
				return;
			case "turn_start":
				this.state = "running";
				this.turnCount += 1;
				this.currentTurnToolStarts = [];
				return;
			case "turn_end":
				this.state = "running";
				this.captureAssistantPreviewFromMessage(event.message);
				this.captureStopReasonFromMessage(event.message);
				this.captureFinalAssistantTextFromMessage(event.message);
				return;
			case "message_start":
			case "message_update":
				this.state = "running";
				this.captureAssistantPreviewFromMessage(event.message);
				this.captureStopReasonFromMessage(event.message);
				return;
			case "message_end":
				this.state = "running";
				this.captureAssistantPreviewFromMessage(event.message);
				this.captureStopReasonFromMessage(event.message);
				this.captureFinalAssistantTextFromMessage(event.message);
				return;
			case "tool_execution_start":
				this.state = "running";
				this.captureCurrentTool(event);
				this.captureCurrentToolInput(event, { resetOnMissing: true });
				this.recordToolStart(event);
				return;
			case "tool_execution_update":
				this.state = "running";
				this.captureCurrentTool(event);
				this.captureCurrentToolInput(event, { resetOnMissing: false });
				return;
			case "tool_execution_end":
				this.state = "running";
				this.executedToolCount += 1;
				this.recordToolEnd(event);
				this.captureLastToolResult(event);
				this.clearCurrentTool(event);
				return;
			default:
				return;
		}
	}

	private captureSessionHeader(event: JsonEvent): void {
		const header: RunnerSubagentJsonSessionHeader = { type: "session" };
		for (const [key, value] of Object.entries(event)) {
			header[key] = value;
		}
		this.sessionHeader = header;
		const headerSessionFile = event.sessionFile ?? event.file;
		if (typeof headerSessionFile === "string" && headerSessionFile.length > 0) {
			this.sessionFile = headerSessionFile;
		}
	}

	private captureModelChange(event: JsonRecord): void {
		if (typeof event.provider !== "string" || typeof event.modelId !== "string") return;
		this.launch = {
			...this.currentLaunchMetadata(),
			model: { provider: event.provider, id: event.modelId },
		};
	}

	private captureThinkingLevelChange(event: JsonRecord): void {
		if (!isThinkingLevel(event.thinkingLevel)) return;
		this.launch = {
			...this.currentLaunchMetadata(),
			thinkingLevel: event.thinkingLevel,
		};
	}

	private currentLaunchMetadata(): RunnerSubagentLaunchMetadata {
		return this.launch ?? { thinkingLevel: "off", hasModelArg: false, hasThinkingArg: false };
	}

	private captureCurrentTool(event: JsonRecord): void {
		if (typeof event.toolName === "string") this.currentTool = event.toolName;
		if (typeof event.toolCallId === "string") this.currentToolCallId = event.toolCallId;
	}

	private clearCurrentTool(event: JsonRecord): void {
		const eventToolCallId = typeof event.toolCallId === "string" ? event.toolCallId : undefined;
		if (!eventToolCallId || eventToolCallId === this.currentToolCallId) {
			this.currentTool = undefined;
			this.currentToolCallId = undefined;
			delete this.activity.currentToolInputPreview;
		}
	}

	private captureCurrentToolInput(event: JsonRecord, options: { resetOnMissing: boolean }): void {
		if (!hasToolInputValue(event)) {
			if (options.resetOnMissing) delete this.activity.currentToolInputPreview;
			return;
		}

		const preview = toolInputPreviewFromEvent(event);
		if (preview === undefined) {
			delete this.activity.currentToolInputPreview;
			return;
		}
		this.activity.currentToolInputPreview = preview;
	}

	private captureLastToolResult(event: JsonRecord): void {
		if (typeof event.toolName === "string") {
			this.activity.lastToolName = event.toolName;
		} else {
			delete this.activity.lastToolName;
		}

		const preview = toolResultPreviewFromEvent(event);
		if (preview === undefined) {
			delete this.activity.lastToolResultPreview;
		} else {
			this.activity.lastToolResultPreview = preview;
		}
		this.activity.lastToolResultIsError = event.isError === true;
	}

	private recordToolStart(event: JsonRecord): void {
		if (typeof event.toolName !== "string") return;
		const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : undefined;
		const start = {
			toolName: event.toolName,
			...(toolCallId === undefined ? {} : { toolCallId }),
		};
		this.currentTurnToolStarts.push(start);
		if (!this.terminalToolNames.has(event.toolName)) {
			this.detectMixedTerminalBatch(event);
			return;
		}

		this.terminalAttempted = true;
		this.detectMixedTerminalBatch(event);
	}

	private recordToolEnd(event: JsonRecord): void {
		if (typeof event.toolName !== "string" || !this.terminalToolNames.has(event.toolName)) return;
		if (event.isError !== true || this.terminalExecutionError) return;
		const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : undefined;
		this.terminalExecutionError = {
			message: `Terminal tool ${event.toolName} failed during execution before producing a valid capture.`,
			toolName: event.toolName,
			...(toolCallId === undefined ? {} : { toolCallId }),
			event,
		};
	}

	private detectMixedTerminalBatch(event: JsonRecord): void {
		// Pi exposes sibling tool calls to the parent as execution starts. We can detect
		// and fail a mixed terminal batch deterministically, but an earlier sibling may
		// already have run before the terminal protocol violation is observable.
		if (this.protocolError || this.terminalToolNames.size === 0) return;
		const terminalStarts = this.currentTurnToolStarts.filter((start) => this.terminalToolNames.has(start.toolName));
		if (terminalStarts.length === 0) return;
		if (terminalStarts.length > 1) {
			this.protocolError = {
				message: "Multiple terminal tools were called in the same assistant turn.",
				event,
			};
			return;
		}
		if (this.currentTurnToolStarts.length > terminalStarts.length) {
			this.protocolError = {
				message: "Terminal tool was mixed with sibling tool calls in the same assistant turn.",
				event,
			};
		}
	}

	private captureStopReasonFromMessages(messages: unknown): void {
		if (!Array.isArray(messages)) return;
		for (const message of messages) {
			this.captureStopReasonFromMessage(message);
		}
	}

	private captureAssistantPreviewFromMessages(messages: unknown): void {
		if (!Array.isArray(messages)) return;
		for (const message of messages) {
			this.captureAssistantPreviewFromMessage(message);
		}
	}

	private captureAssistantPreviewFromMessage(message: unknown): void {
		const preview = assistantVisibleTextFromMessage(message);
		if (preview !== undefined) this.activity.assistantPreview = preview;
	}

	private captureFinalAssistantTextFromMessages(messages: unknown): void {
		if (!Array.isArray(messages)) return;
		for (const message of messages) {
			this.captureFinalAssistantTextFromMessage(message);
		}
	}

	private captureFinalAssistantTextFromMessage(message: unknown): void {
		const text = captureAssistantTextFromMessage(message);
		if (text !== undefined) this.finalAssistantText = text;
	}

	private captureStopReasonFromMessage(message: unknown): void {
		if (!isRecord(message) || message.role !== "assistant") return;
		if (typeof message.stopReason === "string" && message.stopReason.length > 0) {
			this.stopReason = message.stopReason;
		}
		if (typeof message.errorMessage === "string" && message.errorMessage.length > 0) {
			this.errorMessage = message.errorMessage;
		}
	}

	private fail(line: string, cause: unknown): void {
		this.parseError = new RunnerSubagentJsonEventParserError(`Malformed runner subagent Pi JSONL output: ${errorMessage(cause)}`, line, cause);
		this.markStopped();
	}

	private elapsedMs(): number {
		return Math.max(0, this.now() - this.startTimeMs);
	}
}

export function createRunnerSubagentJsonEventParser(
	options: RunnerSubagentJsonEventParserOptions = {},
): RunnerSubagentJsonEventParser {
	return new RunnerSubagentJsonEventParser(options);
}

export function captureAssistantTextFromMessage(message: unknown): string | undefined {
	if (!isRecord(message) || message.role !== "assistant") return undefined;
	return assistantTextFromContent(message.content);
}

export function assistantTextFromContent(content: unknown): string | undefined {
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

function isJsonEvent(value: unknown): value is JsonEvent {
	return isRecord(value) && typeof value.type === "string";
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return value === "off" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function cloneLaunchMetadata(launch: RunnerSubagentLaunchMetadata | undefined): RunnerSubagentLaunchMetadata | undefined {
	if (launch === undefined) return undefined;
	return {
		...launch,
		...(launch.model === undefined ? {} : { model: { ...launch.model } }),
	};
}

export function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasToolInputValue(event: JsonRecord): boolean {
	return ["args", "arguments", "input"].some((key) => Object.prototype.hasOwnProperty.call(event, key));
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
