import type { ChildSessionProgress } from "../run-child-session.ts";

export type ChildSessionJsonEventParserOptions = {
	title?: string;
	sessionFile?: string;
	now?: () => number;
	startTimeMs?: number;
};

export type ChildSessionJsonSessionHeader = {
	type: "session";
	version?: number;
	id?: string;
	timestamp?: string;
	cwd?: string;
	[key: string]: unknown;
};

export type ChildSessionJsonEventParserSnapshot = {
	progress: ChildSessionProgress;
	sessionHeader?: ChildSessionJsonSessionHeader;
	stopReason?: string;
	errorMessage?: string;
	error?: ChildSessionJsonEventParserError;
};

export class ChildSessionJsonEventParserError extends Error {
	readonly line: string;
	readonly cause: unknown;

	constructor(message: string, line: string, cause: unknown) {
		super(message);
		this.name = "ChildSessionJsonEventParserError";
		this.line = line;
		this.cause = cause;
	}
}

type ParserState = ChildSessionProgress["state"];

type JsonRecord = Record<string, unknown>;

export class ChildSessionJsonEventParser {
	private readonly title: string | undefined;
	private readonly now: () => number;
	private readonly startTimeMs: number;
	private buffer = "";
	private state: ParserState = "starting";
	private currentTool: string | undefined;
	private currentToolCallId: string | undefined;
	private executedToolCount = 0;
	private turnCount = 0;
	private sessionFile: string | undefined;
	private sessionHeader: ChildSessionJsonSessionHeader | undefined;
	private stopReason: string | undefined;
	private errorMessage: string | undefined;
	private parseError: ChildSessionJsonEventParserError | undefined;

	constructor(options: ChildSessionJsonEventParserOptions = {}) {
		this.title = options.title;
		this.now = options.now ?? Date.now;
		this.startTimeMs = options.startTimeMs ?? this.now();
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

	markStopped(): void {
		this.state = "stopped";
		this.currentTool = undefined;
		this.currentToolCallId = undefined;
	}

	getSnapshot(): ChildSessionJsonEventParserSnapshot {
		const snapshot: ChildSessionJsonEventParserSnapshot = {
			progress: this.getProgress(),
		};
		if (this.sessionHeader) snapshot.sessionHeader = this.sessionHeader;
		if (this.stopReason) snapshot.stopReason = this.stopReason;
		if (this.errorMessage) snapshot.errorMessage = this.errorMessage;
		if (this.parseError) snapshot.error = this.parseError;
		return snapshot;
	}

	getProgress(): ChildSessionProgress {
		return {
			...(this.title === undefined ? {} : { title: this.title }),
			state: this.state,
			...(this.currentTool === undefined ? {} : { currentTool: this.currentTool }),
			toolCount: this.executedToolCount,
			turnCount: this.turnCount,
			elapsedMs: this.elapsedMs(),
			...(this.sessionFile === undefined ? {} : { sessionFile: this.sessionFile }),
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

		if (!isRecord(event) || typeof event.type !== "string") {
			this.fail(line, new Error("JSONL event must be an object with a string type."));
			return;
		}

		this.processEvent(event as JsonRecord & { type: string });
	}

	private processEvent(event: JsonRecord & { type: string }): void {
		switch (event.type) {
			case "session":
				this.captureSessionHeader(event);
				return;
			case "agent_start":
				this.state = "running";
				return;
			case "agent_end":
				this.captureStopReasonFromMessages(event.messages);
				this.markStopped();
				return;
			case "turn_start":
				this.state = "running";
				this.turnCount += 1;
				return;
			case "turn_end":
				this.state = "running";
				this.captureStopReasonFromMessage(event.message);
				return;
			case "message_start":
			case "message_update":
			case "message_end":
				this.state = "running";
				this.captureStopReasonFromMessage(event.message);
				return;
			case "tool_execution_start":
				this.state = "running";
				this.captureCurrentTool(event);
				return;
			case "tool_execution_update":
				this.state = "running";
				this.captureCurrentTool(event);
				return;
			case "tool_execution_end":
				this.state = "running";
				this.executedToolCount += 1;
				this.clearCurrentTool(event);
				return;
			default:
				return;
		}
	}

	private captureSessionHeader(event: JsonRecord & { type: string }): void {
		const header: ChildSessionJsonSessionHeader = { type: "session" };
		for (const [key, value] of Object.entries(event)) {
			header[key] = value;
		}
		this.sessionHeader = header;
		const headerSessionFile = event.sessionFile ?? event.file;
		if (typeof headerSessionFile === "string" && headerSessionFile.length > 0) {
			this.sessionFile = headerSessionFile;
		}
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
		}
	}

	private captureStopReasonFromMessages(messages: unknown): void {
		if (!Array.isArray(messages)) return;
		for (const message of messages) {
			this.captureStopReasonFromMessage(message);
		}
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
		this.parseError = new ChildSessionJsonEventParserError(`Malformed child Pi JSONL output: ${errorMessage(cause)}`, line, cause);
		this.markStopped();
	}

	private elapsedMs(): number {
		return Math.max(0, this.now() - this.startTimeMs);
	}
}

export function createChildSessionJsonEventParser(
	options: ChildSessionJsonEventParserOptions = {},
): ChildSessionJsonEventParser {
	return new ChildSessionJsonEventParser(options);
}

function chunkToString(chunk: string | Uint8Array): string {
	return typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
