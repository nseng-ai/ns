import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { RunnerSubagentProgress } from "./extension-api.ts";

export const RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS = 240;

export interface RunnerSubagentActivity {
	assistantPreview?: string;
	currentToolInputPreview?: string;
	lastToolName?: string;
	lastToolResultPreview?: string;
	lastToolResultIsError?: boolean;
}

export interface RunnerSubagentUpdate {
	progress: RunnerSubagentProgress;
	activity: RunnerSubagentActivity;
}

export interface MessageToolCallDescriptor {
	toolName: string;
	toolCallId?: string;
	input?: unknown;
}

export interface MessageToolResultDescriptor {
	toolCallId?: string;
	toolName?: string;
	result?: unknown;
	isError: boolean;
}

export function emptyRunnerSubagentActivity(): RunnerSubagentActivity {
	return {};
}

export function runnerSubagentPrimaryActivityPreview(
	activity: RunnerSubagentActivity,
): string | undefined {
	return activity.assistantPreview ?? activity.currentToolInputPreview;
}

export function previewJsonEventValue(
	value: unknown,
	limit = RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS,
): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string") return nonEmptyCompactPreview(value, limit);

	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(value, createSafeJsonReplacer());
	} catch {
		serialized = String(value);
	}

	serialized ??= String(value);
	return nonEmptyCompactPreview(serialized, limit);
}

export function compactPreviewText(
	text: string,
	limit = RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS,
): string {
	const compacted = text.replace(/\s+/g, " ").trim();
	if (limit <= 0) return "";
	if (compacted.length <= limit) return compacted;
	if (limit === 1) return "…";
	return `${compacted.slice(0, limit - 1)}…`;
}

export function assistantVisibleTextFromMessage(message: unknown): string | undefined {
	const text = rawAssistantVisibleTextFromMessage(message);
	return text === undefined ? undefined : nonEmptyCompactPreview(text);
}

export function firstMatchingEventPreview(
	event: Record<string, unknown>,
	keys: readonly string[],
): string | undefined {
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(event, key)) {
			return previewJsonEventValue(event[key]);
		}
	}
	return undefined;
}

export function toolInputPreviewFromEvent(event: Record<string, unknown>): string | undefined {
	return firstMatchingEventPreview(event, ["args", "arguments", "input"]);
}

export function toolResultPreviewFromEvent(event: Record<string, unknown>): string | undefined {
	if (!Object.prototype.hasOwnProperty.call(event, "result")) return undefined;
	const result = event.result;
	const contentText = toolResultTextContent(result);
	if (contentText !== undefined) {
		const preview = nonEmptyCompactPreview(contentText);
		if (preview !== undefined) return preview;
	}
	return previewJsonEventValue(result);
}

export function extractMessageToolCalls(message: unknown): MessageToolCallDescriptor[] {
	if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) {
		return [];
	}
	const toolCalls: MessageToolCallDescriptor[] = [];
	for (const block of message.content) {
		if (!isRecord(block) || block.type !== "toolCall" || typeof block.name !== "string") {
			continue;
		}
		const toolCallId = firstStringField(block, ["id", "toolCallId", "tool_call_id"]);
		const input = firstOwnFieldValue(block, ["arguments", "input", "args"]);
		toolCalls.push({
			toolName: block.name,
			...optionalEntry("toolCallId", toolCallId),
			...optionalEntry("input", input),
		});
	}
	return toolCalls;
}

export function extractMessageToolResult(
	message: unknown,
): MessageToolResultDescriptor | undefined {
	if (!isRecord(message) || message.role !== "toolResult") return undefined;
	const toolCallId = firstStringField(message, ["toolCallId", "tool_call_id", "id"]);
	const toolName = firstStringField(message, ["toolName", "name"]);
	const blockResult = firstToolResultContentBlock(message.content);
	const result =
		firstOwnFieldValue(message, ["result", "output"]) ??
		blockResult ??
		(Array.isArray(message.content) ? { content: message.content } : message.content);
	const isError = message.isError === true || message.error === true || message.status === "error";
	return {
		...optionalEntry("toolCallId", toolCallId),
		...optionalEntry("toolName", toolName),
		...optionalEntry("result", result),
		isError,
	};
}

export function toolCallEventRecord(toolCall: MessageToolCallDescriptor): Record<string, unknown> {
	return {
		toolName: toolCall.toolName,
		...optionalEntry("toolCallId", toolCall.toolCallId),
		...optionalEntry("input", toolCall.input),
	};
}

export function toolResultEventRecord(
	toolResult: MessageToolResultDescriptor,
): Record<string, unknown> {
	return {
		...optionalEntry("toolName", toolResult.toolName),
		...optionalEntry("toolCallId", toolResult.toolCallId),
		...optionalEntry("result", toolResult.result),
		isError: toolResult.isError,
	};
}

function rawAssistantVisibleTextFromMessage(message: unknown): string | undefined {
	if (!isRecord(message) || message.role !== "assistant") return undefined;
	if (!Array.isArray(message.content)) return undefined;
	const textBlocks: string[] = [];
	for (const block of message.content) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
		textBlocks.push(block.text);
	}
	const text = textBlocks.join("\n\n").trim();
	return text.length > 0 ? text : undefined;
}

function toolResultTextContent(value: unknown): string | undefined {
	if (!isRecord(value) || !Array.isArray(value.content)) return undefined;
	const textBlocks: string[] = [];
	for (const block of value.content) {
		if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
		textBlocks.push(block.text);
	}
	return textBlocks.length === 0 ? undefined : textBlocks.join("\n\n");
}

function firstToolResultContentBlock(content: unknown): unknown {
	if (!Array.isArray(content)) return undefined;
	for (const block of content) {
		if (!isRecord(block)) continue;
		const result = firstOwnFieldValue(block, ["result", "output"]);
		if (result !== undefined) return result;
	}
	return undefined;
}

function firstStringField(
	record: Record<string, unknown>,
	keys: readonly string[],
): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

function firstOwnFieldValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(record, key)) return record[key];
	}
	return undefined;
}

function nonEmptyCompactPreview(
	text: string,
	limit = RUNNER_SUBAGENT_ACTIVITY_PREVIEW_CHARS,
): string | undefined {
	const preview = compactPreviewText(text, limit);
	return preview.length > 0 ? preview : undefined;
}

function createSafeJsonReplacer(): (key: string, value: unknown) => unknown {
	const seen = new WeakSet<object>();
	return (_key: string, value: unknown): unknown => {
		if (typeof value === "bigint") return `${value.toString()}n`;
		if (typeof value !== "object" || value === null) return value;
		if (seen.has(value)) return "[Circular]";
		seen.add(value);
		return value;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
