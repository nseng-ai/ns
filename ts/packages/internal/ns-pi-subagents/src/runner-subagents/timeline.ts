import { isRecord, optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	assistantVisibleTextFromMessage,
	compactPreviewText,
	firstMatchingEventPreview,
	previewJsonEventValue,
	toolInputValueFromEvent,
	toolResultPreviewFromEvent,
} from "./activity.ts";
import { createSessionEventNormalizer } from "./message-normalization.ts";
import {
	visitRunnerSubagentSessionJsonlEvents,
	type JsonEvent,
	type JsonRecord,
} from "./json-events.ts";

export type RunnerSubagentToolInvocation =
	| { kind: "text"; text: string }
	| {
			kind: "fields";
			fields: Readonly<{ path?: string; command?: string }>;
	  };

export interface RunnerSubagentTimelineAssistantEntry {
	kind: "assistant";
	text: string;
	timestampMs?: number;
}

export interface RunnerSubagentTimelineToolEntry {
	kind: "tool";
	toolName: string;
	state: "running" | "ok" | "error";
	inputPreview?: string;
	resultPreview?: string;
	timestampMs?: number;
	invocation?: RunnerSubagentToolInvocation;
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
	const normalizer = createSessionEventNormalizer();
	visitRunnerSubagentSessionJsonlEvents(jsonl, (event) => {
		const timestampMs = eventTimestampMs(event);
		for (const normalizedEvent of normalizer.normalize(event)) {
			captureTimelineEvent(accumulator, normalizedEvent, timestampMs);
		}
	});
	return {
		entries: accumulator.entries,
		droppedEntryCount: accumulator.droppedEntryCount,
		currentAction: currentActionFromPendingTools(accumulator.pendingTools),
	};
}

function eventTimestampMs(event: JsonRecord): number | undefined {
	if (typeof event.timestamp !== "string") return undefined;
	const parsedMs = Date.parse(event.timestamp);
	return Number.isNaN(parsedMs) ? undefined : parsedMs;
}

function captureTimelineEvent(
	accumulator: TimelineAccumulator,
	event: JsonEvent,
	timestampMs: number | undefined,
): void {
	switch (event.type) {
		case "message_end":
		case "turn_end":
			captureAssistantEntry(accumulator, event.message, timestampMs);
			return;
		case "agent_end":
			captureAgentEndAssistantEntries(accumulator, event.messages, timestampMs);
			return;
		case "tool_execution_start":
			captureToolStart(accumulator, event, timestampMs);
			return;
		case "tool_execution_update":
			captureToolUpdate(accumulator, event);
			return;
		case "tool_execution_end":
			captureToolEnd(accumulator, event, timestampMs);
			return;
		default:
			return;
	}
}

function captureAgentEndAssistantEntries(
	accumulator: TimelineAccumulator,
	messages: unknown,
	timestampMs: number | undefined,
): void {
	if (!Array.isArray(messages)) return;
	for (const message of messages) captureAssistantEntry(accumulator, message, timestampMs);
}

function captureAssistantEntry(
	accumulator: TimelineAccumulator,
	message: unknown,
	timestampMs: number | undefined,
): void {
	const text = assistantVisibleTextFromMessage(message);
	if (text === undefined) return;
	const last = accumulator.entries.at(-1);
	if (last?.kind === "assistant" && last.text === text) return;
	pushTimelineEntry(accumulator, {
		kind: "assistant",
		text,
		...optionalEntry("timestampMs", timestampMs),
	});
}

function captureToolStart(
	accumulator: TimelineAccumulator,
	event: JsonRecord,
	timestampMs: number | undefined,
): void {
	const toolName = eventToolName(event);
	const key = toolKey(event, toolName);
	const input = toolInputValueFromEvent(event);
	const inputPreview = previewJsonEventValue(input);
	const invocation = toolInvocationFromInput(input);
	const pending = accumulator.pendingTools.get(key);
	if (pending !== undefined) {
		if (inputPreview !== undefined) pending.inputPreview = inputPreview;
		if (invocation !== undefined) pending.invocation = invocation;
		return;
	}
	const entry: RunnerSubagentTimelineToolEntry = {
		kind: "tool",
		toolName,
		state: "running",
		...optionalEntry("inputPreview", inputPreview),
		...optionalEntry("timestampMs", timestampMs),
		...optionalEntry("invocation", invocation),
	};
	pushTimelineEntry(accumulator, entry);
	accumulator.pendingTools.set(key, entry);
}

function captureToolUpdate(accumulator: TimelineAccumulator, event: JsonRecord): void {
	const toolName = eventToolName(event);
	const pending = accumulator.pendingTools.get(toolKey(event, toolName));
	if (pending === undefined) return;
	const input = toolInputValueFromEvent(event);
	const inputPreview = previewJsonEventValue(input);
	const resultPreview = toolOutputPreviewFromEvent(event);
	const invocation = toolInvocationFromInput(input);
	if (inputPreview !== undefined) pending.inputPreview = inputPreview;
	if (resultPreview !== undefined) pending.resultPreview = resultPreview;
	if (invocation !== undefined) pending.invocation = invocation;
}

function captureToolEnd(
	accumulator: TimelineAccumulator,
	event: JsonRecord,
	timestampMs: number | undefined,
): void {
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
		...optionalEntry("timestampMs", timestampMs),
	});
}

function toolInvocationFromInput(input: unknown): RunnerSubagentToolInvocation | undefined {
	if (typeof input === "string") {
		const text = compactPreviewText(input);
		return text.length === 0 ? undefined : { kind: "text", text };
	}
	if (!isRecord(input)) return undefined;
	const path = boundedInvocationField(input.path);
	const command = boundedInvocationField(input.command);
	if (path === undefined && command === undefined) return undefined;
	return {
		kind: "fields",
		fields: {
			...optionalEntry("path", path),
			...optionalEntry("command", command),
		},
	};
}

function boundedInvocationField(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const bounded = compactPreviewText(value);
	return bounded.length === 0 ? undefined : bounded;
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
		...input.pending,
		state: input.event.isError === true ? "error" : "ok",
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
