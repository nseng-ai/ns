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
