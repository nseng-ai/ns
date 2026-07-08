import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	assistantVisibleTextFromMessage,
	extractMessageToolCalls,
	extractMessageToolResult,
	firstMatchingEventPreview,
	toolCallEventRecord,
	toolInputPreviewFromEvent,
	toolResultEventRecord,
	toolResultPreviewFromEvent,
	type MessageToolCallDescriptor,
	type MessageToolResultDescriptor,
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
			resultPreview?: string;
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
		case "message":
			captureMessageEvent(accumulator, event.message);
			return;
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

function captureMessageEvent(accumulator: TimelineAccumulator, message: unknown): void {
	captureAssistantEntry(accumulator, message);
	for (const toolCall of extractMessageToolCalls(message)) {
		captureMessageToolCall(accumulator, toolCall);
	}
	const toolResult = extractMessageToolResult(message);
	if (toolResult !== undefined) captureMessageToolResult(accumulator, toolResult);
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
	const key = toolKey(event, toolName);
	const inputPreview = toolInputPreviewFromEvent(event);
	const pending = accumulator.pendingTools.get(key);
	if (pending !== undefined) {
		if (inputPreview !== undefined) pending.inputPreview = inputPreview;
		return;
	}
	const entry: RunnerSubagentTimelineToolEntry = {
		kind: "tool",
		toolName,
		state: "running",
		...optionalEntry("inputPreview", inputPreview),
	};
	pushTimelineEntry(accumulator, entry);
	accumulator.pendingTools.set(key, entry);
}

function captureMessageToolCall(
	accumulator: TimelineAccumulator,
	toolCall: MessageToolCallDescriptor,
): void {
	const event = toolCallEventRecord(toolCall);
	captureToolStart(accumulator, event);
}

function captureToolUpdate(accumulator: TimelineAccumulator, event: JsonRecord): void {
	const toolName = eventToolName(event);
	const pending = accumulator.pendingTools.get(toolKey(event, toolName));
	if (pending === undefined) return;
	const inputPreview = toolInputPreviewFromEvent(event);
	const resultPreview = toolOutputPreviewFromEvent(event);
	if (inputPreview !== undefined) pending.inputPreview = inputPreview;
	if (resultPreview !== undefined) pending.resultPreview = resultPreview;
}

function captureMessageToolResult(
	accumulator: TimelineAccumulator,
	toolResult: MessageToolResultDescriptor,
): void {
	const event = toolResultEventRecord(toolResult);
	const pendingKey = pendingToolResultKey(accumulator.pendingTools, event);
	if (pendingKey === undefined) {
		captureToolEnd(accumulator, event);
		return;
	}
	completePendingTool(accumulator, pendingKey, event);
}

function captureToolEnd(accumulator: TimelineAccumulator, event: JsonRecord): void {
	const toolName = eventToolName(event);
	const state = event.isError === true ? "error" : "ok";
	const resultPreview = toolResultPreviewFromEvent(event);
	const key = toolKey(event, toolName);
	const pending = accumulator.pendingTools.get(key);
	if (pending !== undefined) {
		completePendingTool(accumulator, key, event);
		return;
	}
	pushTimelineEntry(accumulator, {
		kind: "tool",
		toolName,
		state,
		...optionalEntry("resultPreview", resultPreview),
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
		...optionalEntry("inputPreview", latestPendingTool.inputPreview),
		...optionalEntry("resultPreview", latestPendingTool.resultPreview),
	};
}

function pendingToolResultKey(
	pendingTools: ReadonlyMap<string, RunnerSubagentTimelineToolEntry>,
	event: JsonRecord,
): string | undefined {
	if (typeof event.toolCallId === "string") {
		const idKey = `id:${event.toolCallId}`;
		if (pendingTools.has(idKey)) return idKey;
	}
	const toolName = typeof event.toolName === "string" ? event.toolName : undefined;
	if (toolName !== undefined) {
		const nameKey = `name:${toolName}`;
		if (pendingTools.has(nameKey)) return nameKey;
	}
	return Array.from(pendingTools.keys()).at(-1);
}

function completePendingTool(
	accumulator: TimelineAccumulator,
	pendingKey: string,
	event: JsonRecord,
): void {
	const pending = accumulator.pendingTools.get(pendingKey);
	if (pending === undefined) return;
	const finished = finishPendingTool({ pending, event });
	const entries = accumulator.entries;
	const pendingTools = accumulator.pendingTools;
	const entryIndex = entries.indexOf(pending);
	if (entryIndex >= 0) entries[entryIndex] = finished;
	pendingTools.delete(pendingKey);
}

function finishPendingTool(input: {
	pending: RunnerSubagentTimelineToolEntry;
	event: JsonRecord;
}): RunnerSubagentTimelineToolEntry {
	const resultPreview = toolResultPreviewFromEvent(input.event);
	return {
		kind: "tool",
		toolName: input.pending.toolName,
		state: input.event.isError === true ? "error" : "ok",
		...optionalEntry("inputPreview", input.pending.inputPreview),
		...optionalEntry("resultPreview", resultPreview),
	};
}

function toolOutputPreviewFromEvent(event: JsonRecord): string | undefined {
	return (
		toolResultPreviewFromEvent(event) ??
		firstMatchingEventPreview(event, ["partialResult", "output"])
	);
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
