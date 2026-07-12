import { isRecord } from "@nseng-ai/foundation/primitives";

import {
	assistantVisibleTextFromMessage,
	extractMessageToolCalls,
	extractMessageToolResult,
	toolCallEventRecord,
	toolResultEventRecord,
	type MessageToolCallDescriptor,
} from "./activity.ts";
import type { JsonEvent, JsonRecord } from "./json-events.ts";

export interface SessionEventNormalizer {
	normalize(event: JsonEvent): JsonEvent[];
}

export function createSessionEventNormalizer(): SessionEventNormalizer {
	return new DefaultSessionEventNormalizer();
}

class DefaultSessionEventNormalizer implements SessionEventNormalizer {
	private hasExplicitTurnEvents = false;
	private syntheticAssistantMessageKeys = new Set<string>();
	private completedToolCallIds = new Set<string>();

	normalize(event: JsonEvent): JsonEvent[] {
		switch (event.type) {
			case "turn_start":
			case "turn_end":
				this.hasExplicitTurnEvents = true;
				return [event];
			case "tool_execution_end":
				return this.recordToolEnd(event) ? [event] : [];
			case "message":
				return this.normalizeMessage(event.message);
			default:
				return [event];
		}
	}

	private normalizeMessage(message: unknown): JsonEvent[] {
		const toolCalls = extractMessageToolCalls(message);
		const toolResult = extractMessageToolResult(message);
		const events: JsonEvent[] = [];
		if (isUsefulAssistantMessage(message, toolCalls)) {
			if (this.shouldEmitSyntheticTurn(message)) events.push({ type: "turn_start" });
			events.push({ type: "message_end", message });
		}
		for (const toolCall of toolCalls) {
			events.push({ type: "tool_execution_start", ...toolCallEventRecord(toolCall) });
		}
		if (toolResult !== undefined) {
			const event = { type: "tool_execution_end", ...toolResultEventRecord(toolResult) };
			if (this.recordToolEnd(event)) events.push(event);
		}
		return events;
	}

	private shouldEmitSyntheticTurn(message: unknown): boolean {
		if (this.hasExplicitTurnEvents) return false;
		const key = syntheticAssistantMessageKey(message);
		if (key === undefined) return true;
		if (this.syntheticAssistantMessageKeys.has(key)) return false;
		this.syntheticAssistantMessageKeys.add(key);
		return true;
	}

	private recordToolEnd(event: JsonRecord): boolean {
		if (typeof event.toolCallId !== "string") return true;
		if (this.completedToolCallIds.has(event.toolCallId)) return false;
		this.completedToolCallIds.add(event.toolCallId);
		return true;
	}
}

function isUsefulAssistantMessage(
	message: unknown,
	toolCalls: readonly MessageToolCallDescriptor[],
): boolean {
	return assistantVisibleTextFromMessage(message) !== undefined || toolCalls.length > 0;
}

function syntheticAssistantMessageKey(message: unknown): string | undefined {
	if (!isRecord(message)) return undefined;
	for (const key of ["id", "messageId", "message_id"] as const) {
		const value = message[key];
		if (typeof value === "string" && value.length > 0) return `${key}:${value}`;
	}
	return undefined;
}
