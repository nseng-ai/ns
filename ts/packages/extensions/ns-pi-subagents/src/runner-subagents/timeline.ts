import {
	assistantVisibleTextFromMessage,
	previewJsonEventValue,
	toolInputPreviewFromEvent,
	toolResultPreviewFromEvent,
} from "./activity.ts";
import {
	visitRunnerSubagentSessionJsonlEvents,
	type JsonEvent,
	type JsonRecord,
} from "./json-events.ts";

export interface RunnerSubagentTimelineAssistantEntry {
	kind: "assistant";
	text: string;
}

export interface RunnerSubagentTimelineToolEntry {
	kind: "tool";
	toolName: string;
	state: "running" | "ok" | "error";
	inputPreview?: string;
	resultPreview?: string;
}

export type RunnerSubagentTimelineEntry =
	| RunnerSubagentTimelineAssistantEntry
	| RunnerSubagentTimelineToolEntry;

export type RunnerSubagentCurrentAction =
	| {
			kind: "tool";
			toolName: string;
			inputPreview?: string;
			outputPreview?: string;
	  }
	| { kind: "thinking" }
	| { kind: "idle" };

export interface RunnerSubagentTimeline {
	entries: readonly RunnerSubagentTimelineEntry[];
	droppedEntryCount: number;
	currentAction: RunnerSubagentCurrentAction;
}

export interface ExtractRunnerSubagentTimelineOptions {
	entryCap?: number;
}

interface TimelineAccumulator {
	entries: RunnerSubagentTimelineEntry[];
	droppedEntryCount: number;
	entryCap: number;
	pendingTools: Map<string, RunnerSubagentTimelineToolEntry>;
}

const DEFAULT_TIMELINE_ENTRY_CAP = 200;
const UNKNOWN_TOOL_NAME = "unknown";

export function extractRunnerSubagentTimelineFromSessionJsonl(
	jsonl: string,
	options: ExtractRunnerSubagentTimelineOptions = {},
): RunnerSubagentTimeline {
	const accumulator: TimelineAccumulator = {
		entries: [],
		droppedEntryCount: 0,
		entryCap: Math.max(0, options.entryCap ?? DEFAULT_TIMELINE_ENTRY_CAP),
		pendingTools: new Map(),
	};
	visitRunnerSubagentSessionJsonlEvents(jsonl, (event) => captureTimelineEvent(accumulator, event));
	return {
		entries: accumulator.entries,
		droppedEntryCount: accumulator.droppedEntryCount,
		currentAction: currentActionFromPendingTools(accumulator.pendingTools),
	};
}

function captureTimelineEvent(accumulator: TimelineAccumulator, event: JsonEvent): void {
	switch (event.type) {
		case "message_end":
		case "turn_end":
			captureAssistantEntry(accumulator, event.message);
			return;
		case "agent_end":
			captureAgentEndAssistantEntries(accumulator, event.messages);
			return;
		case "tool_execution_start":
			captureToolStart(accumulator, event);
			return;
		case "tool_execution_update":
			captureToolUpdate(accumulator, event);
			return;
		case "tool_execution_end":
			captureToolEnd(accumulator, event);
			return;
		default:
			return;
	}
}

function captureAgentEndAssistantEntries(
	accumulator: TimelineAccumulator,
	messages: unknown,
): void {
	if (!Array.isArray(messages)) return;
	for (const message of messages) captureAssistantEntry(accumulator, message);
}

function captureAssistantEntry(accumulator: TimelineAccumulator, message: unknown): void {
	const text = assistantVisibleTextFromMessage(message);
	if (text === undefined) return;
	const last = accumulator.entries.at(-1);
	if (last?.kind === "assistant" && last.text === text) return;
	pushTimelineEntry(accumulator, { kind: "assistant", text });
}

function captureToolStart(accumulator: TimelineAccumulator, event: JsonRecord): void {
	const toolName = eventToolName(event);
	const inputPreview = toolInputPreviewFromEvent(event);
	const entry: RunnerSubagentTimelineToolEntry = {
		kind: "tool",
		toolName,
		state: "running",
		...(inputPreview === undefined ? {} : { inputPreview }),
	};
	pushTimelineEntry(accumulator, entry);
	accumulator.pendingTools.set(toolKey(event, toolName), entry);
}

function captureToolUpdate(accumulator: TimelineAccumulator, event: JsonRecord): void {
	const toolName = eventToolName(event);
	const pending = accumulator.pendingTools.get(toolKey(event, toolName));
	if (pending === undefined) return;
	const inputPreview = toolInputPreviewFromEvent(event);
	const outputPreview = toolOutputPreviewFromEvent(event);
	if (inputPreview !== undefined) pending.inputPreview = inputPreview;
	if (outputPreview !== undefined) pending.resultPreview = outputPreview;
}

function captureToolEnd(accumulator: TimelineAccumulator, event: JsonRecord): void {
	const toolName = eventToolName(event);
	const state = event.isError === true ? "error" : "ok";
	const resultPreview = toolResultPreviewFromEvent(event);
	const key = toolKey(event, toolName);
	const pending = accumulator.pendingTools.get(key);
	if (pending !== undefined) {
		pending.state = state;
		if (resultPreview === undefined) {
			delete pending.resultPreview;
		} else {
			pending.resultPreview = resultPreview;
		}
		accumulator.pendingTools.delete(key);
		return;
	}
	pushTimelineEntry(accumulator, {
		kind: "tool",
		toolName,
		state,
		...(resultPreview === undefined ? {} : { resultPreview }),
	});
}

function currentActionFromPendingTools(
	pendingTools: ReadonlyMap<string, RunnerSubagentTimelineToolEntry>,
): RunnerSubagentCurrentAction {
	const latestPendingTool = Array.from(pendingTools.values()).at(-1);
	if (latestPendingTool === undefined) return { kind: "idle" };
	return {
		kind: "tool",
		toolName: latestPendingTool.toolName,
		...(latestPendingTool.inputPreview === undefined
			? {}
			: { inputPreview: latestPendingTool.inputPreview }),
		...(latestPendingTool.resultPreview === undefined
			? {}
			: { outputPreview: latestPendingTool.resultPreview }),
	};
}

function toolOutputPreviewFromEvent(event: JsonRecord): string | undefined {
	const resultPreview = toolResultPreviewFromEvent(event);
	if (resultPreview !== undefined) return resultPreview;
	for (const key of ["partialResult", "output"] as const) {
		if (Object.prototype.hasOwnProperty.call(event, key)) {
			return previewJsonEventValue(event[key]);
		}
	}
	return undefined;
}

function pushTimelineEntry(
	accumulator: TimelineAccumulator,
	entry: RunnerSubagentTimelineEntry,
): void {
	if (accumulator.entryCap === 0) {
		accumulator.droppedEntryCount += 1;
		return;
	}
	accumulator.entries.push(entry);
	while (accumulator.entries.length > accumulator.entryCap) {
		const dropped = accumulator.entries.shift();
		if (dropped?.kind === "tool") {
			for (const [key, pending] of accumulator.pendingTools) {
				if (pending === dropped) accumulator.pendingTools.delete(key);
			}
		}
		accumulator.droppedEntryCount += 1;
	}
}

function toolKey(event: JsonRecord, fallbackToolName: string): string {
	return typeof event.toolCallId === "string"
		? `id:${event.toolCallId}`
		: `name:${fallbackToolName}`;
}

function eventToolName(event: JsonRecord): string {
	return typeof event.toolName === "string" && event.toolName.length > 0
		? event.toolName
		: UNKNOWN_TOOL_NAME;
}
