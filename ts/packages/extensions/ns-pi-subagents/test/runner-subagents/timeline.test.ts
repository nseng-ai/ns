import { describe, expect, test } from "vitest";

import { extractRunnerSubagentTimelineFromSessionJsonl } from "../../src/runner-subagents/timeline.ts";

function jsonl(events: readonly unknown[]): string {
	return events.map((event) => JSON.stringify(event)).join("\n");
}

function assistantMessage(text: string): unknown {
	return { role: "assistant", content: [{ type: "text", text }] };
}

describe("runner subagent timeline", () => {
	test("preserves ordered assistant, tool, assistant events", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "message_end", message: assistantMessage("Reading files") },
				{
					type: "tool_execution_start",
					toolName: "read",
					toolCallId: "tool-1",
					args: { path: "src/index.ts" },
				},
				{
					type: "tool_execution_end",
					toolName: "read",
					toolCallId: "tool-1",
					result: { content: [{ type: "text", text: "file contents" }] },
				},
				{ type: "message_end", message: assistantMessage("Done") },
			]),
		);

		expect(timeline.entries).toEqual([
			{ kind: "assistant", text: "Reading files" },
			{
				kind: "tool",
				toolName: "read",
				state: "ok",
				inputPreview: '{"path":"src/index.ts"}',
				resultPreview: "file contents",
			},
			{ kind: "assistant", text: "Done" },
		]);
		expect(timeline.droppedEntryCount).toBe(0);
	});

	test("keeps running and error tool states", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "bash", toolCallId: "running", args: "npm test" },
				{ type: "tool_execution_start", toolName: "read", toolCallId: "failed" },
				{
					type: "tool_execution_end",
					toolName: "read",
					toolCallId: "failed",
					isError: true,
					result: "missing file",
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{ kind: "tool", toolName: "bash", state: "running", inputPreview: "npm test" },
			{ kind: "tool", toolName: "read", state: "error", resultPreview: "missing file" },
		]);
		expect(timeline.currentAction).toEqual({
			kind: "tool",
			toolName: "bash",
			inputPreview: "npm test",
		});
	});

	test("clears current tool action after matching tool end", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "bash", toolCallId: "tool-1", args: "just test" },
				{ type: "tool_execution_end", toolName: "bash", toolCallId: "tool-1", result: "ok" },
			]),
		);

		expect(timeline.currentAction).toEqual({ kind: "idle" });
	});

	test("captures tool update output for pending current action", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "bash", toolCallId: "tool-1", args: "just test" },
				{
					type: "tool_execution_update",
					toolName: "bash",
					toolCallId: "tool-1",
					partialResult: "one test passed",
				},
			]),
		);

		expect(timeline.currentAction).toEqual({
			kind: "tool",
			toolName: "bash",
			inputPreview: "just test",
			resultPreview: "one test passed",
		});
	});

	test("chooses the most recently started pending tool for current action", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "read", toolCallId: "tool-1", args: "a.ts" },
				{ type: "tool_execution_start", toolName: "bash", toolCallId: "tool-2", args: "just test" },
			]),
		);

		expect(timeline.currentAction).toEqual({
			kind: "tool",
			toolName: "bash",
			inputPreview: "just test",
		});
	});

	test("captures top-level assistant tool calls and tool result messages", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "message",
					message: {
						role: "assistant",
						content: [
							{ type: "text", text: "Reading files" },
							{ type: "thinking", text: "private reasoning" },
							{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "src/index.ts" } },
						],
					},
				},
				{
					type: "message",
					message: {
						role: "toolResult",
						toolCallId: "tool-1",
						content: [{ type: "text", text: "file contents" }],
					},
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{ kind: "assistant", text: "Reading files" },
			{
				kind: "tool",
				toolName: "read",
				state: "ok",
				inputPreview: '{"path":"src/index.ts"}',
				resultPreview: "file contents",
			},
		]);
		expect(timeline.currentAction).toEqual({ kind: "idle" });
	});

	test("keeps top-level assistant tool call pending as the current action", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "message",
					message: {
						role: "assistant",
						content: [{ type: "toolCall", id: "tool-1", name: "bash", input: "just test" }],
					},
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{ kind: "tool", toolName: "bash", state: "running", inputPreview: "just test" },
		]);
		expect(timeline.currentAction).toEqual({
			kind: "tool",
			toolName: "bash",
			inputPreview: "just test",
		});
	});

	test("captures unmatched top-level tool result messages as best-effort completed entries", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "message",
					message: {
						role: "toolResult",
						isError: true,
						result: "missing file",
					},
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{ kind: "tool", toolName: "unknown", state: "error", resultPreview: "missing file" },
		]);
	});

	test("dedupes repeated message_end and turn_end assistant text", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "message_end", message: assistantMessage("Same answer") },
				{ type: "turn_end", message: assistantMessage("Same answer") },
				{ type: "agent_end", messages: [assistantMessage("Same answer")] },
			]),
		);

		expect(timeline.entries).toEqual([{ kind: "assistant", text: "Same answer" }]);
	});

	test("caps entries from the front and counts dropped entries", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "message_end", message: assistantMessage("one") },
				{ type: "message_end", message: assistantMessage("two") },
				{ type: "message_end", message: assistantMessage("three") },
			]),
			{ entryCap: 2 },
		);

		expect(timeline.droppedEntryCount).toBe(1);
		expect(timeline.entries).toEqual([
			{ kind: "assistant", text: "two" },
			{ kind: "assistant", text: "three" },
		]);
	});

	test("tolerates prose lines, malformed JSON, missing tool names, and unmatched ends", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			[
				"plain prose",
				JSON.stringify({ type: "tool_execution_start", toolCallId: "missing-name" }),
				"{bad json}",
				JSON.stringify({ type: "tool_execution_end", toolName: "write", result: "ok" }),
				JSON.stringify({ type: "message_end", message: assistantMessage("Still parsed") }),
			].join("\n"),
		);

		expect(timeline.entries).toEqual([
			{ kind: "tool", toolName: "unknown", state: "running" },
			{ kind: "tool", toolName: "write", state: "ok", resultPreview: "ok" },
			{ kind: "assistant", text: "Still parsed" },
		]);
	});
});
