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
				invocation: { kind: "fields", fields: { path: "src/index.ts" } },
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
			{
				kind: "tool",
				toolName: "bash",
				state: "running",
				inputPreview: "npm test",
				invocation: { kind: "text", text: "npm test" },
			},
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
				invocation: { kind: "fields", fields: { path: "src/index.ts" } },
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
			{
				kind: "tool",
				toolName: "bash",
				state: "running",
				inputPreview: "just test",
				invocation: { kind: "text", text: "just test" },
			},
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

	test("stamps entries with event timestamps and reports the event span", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "message_end",
					timestamp: "2026-07-11T09:12:01.000Z",
					message: assistantMessage("Starting"),
				},
				{
					type: "tool_execution_start",
					timestamp: "2026-07-11T09:12:09.000Z",
					toolName: "bash",
					toolCallId: "tool-1",
					args: "just ts-check",
				},
				{
					type: "tool_execution_end",
					timestamp: "2026-07-11T09:12:31.000Z",
					toolName: "bash",
					toolCallId: "tool-1",
					result: "ok",
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{ kind: "assistant", text: "Starting", timestampMs: Date.parse("2026-07-11T09:12:01.000Z") },
			{
				kind: "tool",
				toolName: "bash",
				state: "ok",
				inputPreview: "just ts-check",
				resultPreview: "ok",
				timestampMs: Date.parse("2026-07-11T09:12:09.000Z"),
				invocation: { kind: "text", text: "just ts-check" },
			},
		]);
	});

	test("threads top-level message-event timestamps to synthesized entries", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "message",
					timestamp: "2026-07-11T10:00:00.000Z",
					message: {
						role: "assistant",
						content: [
							{ type: "text", text: "Reading files" },
							{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "src/index.ts" } },
						],
					},
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{
				kind: "assistant",
				text: "Reading files",
				timestampMs: Date.parse("2026-07-11T10:00:00.000Z"),
			},
			{
				kind: "tool",
				toolName: "read",
				state: "running",
				inputPreview: '{"path":"src/index.ts"}',
				timestampMs: Date.parse("2026-07-11T10:00:00.000Z"),
				invocation: { kind: "fields", fields: { path: "src/index.ts" } },
			},
		]);
	});

	test("ignores malformed timestamps for stamping and span", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "message_end",
					timestamp: "not-a-timestamp",
					message: assistantMessage("Unstamped"),
				},
			]),
		);

		expect(timeline.entries).toEqual([{ kind: "assistant", text: "Unstamped" }]);
	});

	test("derives command display from bash record-form input", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "tool_execution_start",
					toolName: "bash",
					toolCallId: "tool-1",
					args: { command: "pnpm run test" },
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{
				kind: "tool",
				toolName: "bash",
				state: "running",
				inputPreview: '{"command":"pnpm run test"}',
				invocation: { kind: "fields", fields: { command: "pnpm run test" } },
			},
		]);
	});

	test("derives path display for write and edit tools", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "tool_execution_start",
					toolName: "write",
					toolCallId: "tool-1",
					args: { path: "docs/notes.md", content: "hello" },
				},
				{
					type: "tool_execution_start",
					toolName: "edit",
					toolCallId: "tool-2",
					args: { path: "src/app.ts", oldText: "a", newText: "b" },
				},
			]),
		);

		expect(timeline.entries).toMatchObject([
			{ toolName: "write", invocation: { kind: "fields", fields: { path: "docs/notes.md" } } },
			{ toolName: "edit", invocation: { kind: "fields", fields: { path: "src/app.ts" } } },
		]);
	});

	test("keeps invocation generic for unknown tools and ignores unsupported input fields", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "tool_execution_start",
					toolName: "grep",
					toolCallId: "tool-1",
					args: { pattern: "foo" },
				},
				{
					type: "tool_execution_start",
					toolName: "read",
					toolCallId: "tool-2",
					args: { path: 42 },
				},
			]),
		);

		expect(timeline.entries).toEqual([
			{ kind: "tool", toolName: "grep", state: "running", inputPreview: '{"pattern":"foo"}' },
			{ kind: "tool", toolName: "read", state: "running", inputPreview: '{"path":42}' },
		]);
	});

	test.each([
		{ name: "text", input: "  just   test  ", expected: { kind: "text", text: "just test" } },
		{
			name: "allowed scalar fields",
			input: { path: "src/app.ts", command: "pnpm test", token: "secret" },
			expected: { kind: "fields", fields: { path: "src/app.ts", command: "pnpm test" } },
		},
		{ name: "nested field", input: { path: { value: "src/app.ts" } }, expected: undefined },
		{ name: "non-string field", input: { command: 42 }, expected: undefined },
		{ name: "array input", input: ["pnpm test"], expected: undefined },
		{ name: "sensitive-only field", input: { password: "secret" }, expected: undefined },
	])("extracts a bounded generic invocation for $name input", ({ input, expected }) => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "custom", toolCallId: "tool-1", args: input },
			]),
		);
		const entry = timeline.entries[0];
		if (entry?.kind !== "tool") throw new Error("missing tool entry");
		expect(entry.invocation).toEqual(expected);
	});

	test("caps strings retained by the generic invocation projection", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{
					type: "tool_execution_start",
					toolName: "custom",
					toolCallId: "tool-1",
					args: { path: "a".repeat(300) },
				},
			]),
		);
		const entry = timeline.entries[0];
		if (entry?.kind !== "tool" || entry.invocation?.kind !== "fields") {
			throw new Error("missing field invocation");
		}
		expect(entry.invocation.fields.path).toHaveLength(240);
		expect(entry.invocation.fields.path).toMatch(/…$/);
	});

	test("preserves an existing invocation when an update has no valid projection", () => {
		const timeline = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "custom", toolCallId: "one", args: "first" },
				{
					type: "tool_execution_update",
					toolName: "custom",
					toolCallId: "one",
					args: { path: 42 },
				},
			]),
		);
		expect(timeline.entries[0]).toMatchObject({
			inputPreview: '{"path":42}',
			invocation: { kind: "text", text: "first" },
		});
	});

	test("preserves update fields at completion and replaces result only when terminal data exists", () => {
		const preserved = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "bash", toolCallId: "one", args: "first" },
				{
					type: "tool_execution_update",
					toolName: "bash",
					toolCallId: "one",
					args: { command: "updated" },
					partialResult: "update result",
				},
				{ type: "tool_execution_end", toolName: "bash", toolCallId: "one" },
			]),
		);
		expect(preserved.entries[0]).toMatchObject({
			state: "ok",
			inputPreview: '{"command":"updated"}',
			resultPreview: "update result",
			invocation: { kind: "fields", fields: { command: "updated" } },
		});

		const replaced = extractRunnerSubagentTimelineFromSessionJsonl(
			jsonl([
				{ type: "tool_execution_start", toolName: "bash", toolCallId: "two", args: "first" },
				{
					type: "tool_execution_update",
					toolName: "bash",
					toolCallId: "two",
					partialResult: "update result",
				},
				{
					type: "tool_execution_end",
					toolName: "bash",
					toolCallId: "two",
					result: "terminal result",
				},
			]),
		);
		expect(replaced.entries[0]).toMatchObject({ resultPreview: "terminal result" });
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
