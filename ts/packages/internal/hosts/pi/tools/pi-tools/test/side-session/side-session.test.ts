import { describe, expect, test } from "vitest";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
	AuthStorage,
	ModelRegistry,
	type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";

import { mapAgentSessionEvent, summarizeToolArgs } from "../../src/side-session/events.ts";
import { createPiSideSessionFactory } from "../../src/side-session/factory.ts";

function testAssistantMessage(): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "anthropic-messages",
		provider: "p",
		model: "m",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

describe("Pi side-session factory", () => {
	test("resolves model selection at the registry terminal", async () => {
		const factory = createPiSideSessionFactory();
		const result = await factory.create({
			cwd: "/tmp",
			systemPrompt: "system",
			modelSelection: { provider: "missing-provider", modelId: "missing-model", thinking: "high" },
			modelRegistry: ModelRegistry.inMemory(AuthStorage.inMemory()),
			tools: [],
		});

		expect(result).toEqual({
			ok: false,
			code: "spawn-failed",
			message: "Model missing-provider/missing-model is unavailable.",
		});
	});
});

describe("side-session event mapper", () => {
	test("maps text deltas, assistant end, retry, and turn end", () => {
		const message = testAssistantMessage();
		const textDeltaEvent = {
			type: "message_update",
			message,
			assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hi", partial: message },
		} satisfies AgentSessionEvent;

		expect(mapAgentSessionEvent(textDeltaEvent)).toEqual({ type: "assistant-delta", text: "hi" });
		expect(
			mapAgentSessionEvent({ type: "message_end", message } satisfies AgentSessionEvent),
		).toEqual({ type: "assistant-end" });
		expect(
			mapAgentSessionEvent({
				type: "auto_retry_start",
				attempt: 2,
				maxAttempts: 3,
				delayMs: 500,
				errorMessage: "overloaded",
			} satisfies AgentSessionEvent),
		).toEqual({ type: "retry", attempt: 2, maxAttempts: 3, message: "overloaded" });
		expect(
			mapAgentSessionEvent({
				type: "turn_end",
				message,
				toolResults: [],
			} satisfies AgentSessionEvent),
		).toEqual({ type: "turn-end" });
	});

	test("maps tool execution start and end events", () => {
		const toolStartEvent = {
			type: "tool_execution_start",
			toolName: "read",
			args: { path: "messages.jsonl" },
			toolCallId: "1",
		} satisfies AgentSessionEvent;
		const toolEndEvent = {
			type: "tool_execution_end",
			toolName: "read",
			result: { bytes: 12 },
			isError: false,
			toolCallId: "1",
		} satisfies AgentSessionEvent;

		expect(mapAgentSessionEvent(toolStartEvent)).toEqual({
			type: "tool-start",
			name: "read",
			summary: '{"path":"messages.jsonl"}',
		});
		expect(mapAgentSessionEvent(toolEndEvent)).toEqual({
			type: "tool-end",
			name: "read",
			summary: '{"bytes":12}',
			isError: false,
		});
	});

	test("maps unhandled events to null", () => {
		expect(mapAgentSessionEvent({ type: "agent_start" } satisfies AgentSessionEvent)).toBeNull();
		expect(mapAgentSessionEvent({ type: "turn_start" } satisfies AgentSessionEvent)).toBeNull();
	});

	test("summarizeToolArgs truncates long values at 120 chars", () => {
		expect(summarizeToolArgs(null)).toBe("");
		expect(summarizeToolArgs("short")).toBe("short");
		const long = "x".repeat(200);
		const summary = summarizeToolArgs(long);
		expect(summary.length).toBe(120);
		expect(summary.endsWith("…")).toBe(true);
	});
});
