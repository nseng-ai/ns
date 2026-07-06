import {
	assistantVisibleTextFromMessage,
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

export interface RunnerSubagentTimeline {
	entries: readonly RunnerSubagentTimelineEntry[];
	droppedEntryCount: number;
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

function pushTimelineEntry(
	accumulator: TimelineAccumulator,
	entry: RunnerSubagentTimelineEntry,
): void {
	const mutableTimeline = accumulator;
	if (mutableTimeline.entryCap === 0) {
		mutableTimeline.droppedEntryCount += 1;
		return;
	}
	mutableTimeline.entries.push(entry);
	while (mutableTimeline.entries.length > mutableTimeline.entryCap) {
		const dropped = mutableTimeline.entries.shift();
		if (dropped?.kind === "tool") {
			for (const [key, pending] of mutableTimeline.pendingTools) {
				if (pending === dropped) mutableTimeline.pendingTools.delete(key);
			}
		}
		mutableTimeline.droppedEntryCount += 1;
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
