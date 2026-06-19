import { describe, expect, test } from "vitest";

import { createRunnerSubagentJsonEventParser } from "../src/runner-subagent/json-events.ts";

function jsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

describe("runner subagent JSON event parser", () => {
	test("parses chunked JSONL and captures the session header", () => {
		let now = 1_000;
		const parser = createRunnerSubagentJsonEventParser({
			title: "Child",
			sessionFile: "/tmp/child.jsonl",
			clock: { nowMs: () => now },
		});
		const header = {
			type: "session",
			version: 3,
			id: "session-id",
			timestamp: "2026-05-23T00:00:00Z",
			cwd: "/repo",
		} as const;
		const line = jsonLine(header);

		parser.pushChunk(line.slice(0, 14));
		parser.pushChunk(line.slice(14));
		now = 1_250;

		const snapshot = parser.getSnapshot();
		expect(snapshot.sessionHeader).toEqual(header);
		expect(snapshot.progress).toEqual({
			title: "Child",
			state: "starting",
			toolCount: 0,
			turnCount: 0,
			elapsedMs: 250,
			sessionFile: "/tmp/child.jsonl",
		});
	});

	test("updates launch metadata from child model and thinking events", () => {
		const parser = createRunnerSubagentJsonEventParser({
			launch: {
				requestedModel: "openai-codex/gpt-5.4-mini:medium",
				thinkingLevel: "off",
				hasModelArg: true,
				hasThinkingArg: false,
			},
		});

		parser.pushChunk(
			jsonLine({ type: "model_change", provider: "openai-codex", modelId: "gpt-5.4-mini" }),
		);
		parser.pushChunk(jsonLine({ type: "thinking_level_change", thinkingLevel: "medium" }));

		expect(parser.getSnapshot().progress.launch).toEqual({
			requestedModel: "openai-codex/gpt-5.4-mini:medium",
			model: { provider: "openai-codex", id: "gpt-5.4-mini" },
			thinkingLevel: "off",
			observedThinkingLevel: "medium",
			hasModelArg: true,
			hasThinkingArg: false,
		});
	});

	test("sanitizes child-supplied launch model metadata", () => {
		const parser = createRunnerSubagentJsonEventParser();
		parser.pushChunk(
			jsonLine({
				type: "model_change",
				provider: " openai\ncodex ",
				modelId: `${"x".repeat(200)}\r\nignored`,
			}),
		);

		expect(parser.getSnapshot().progress.launch?.model).toEqual({
			provider: "openai codex",
			id: "x".repeat(160),
		});
	});

	test("tracks agent, turn, tool, elapsed, and stop-reason progress", () => {
		let now = 10;
		const parser = createRunnerSubagentJsonEventParser({ clock: { nowMs: () => now } });

		parser.pushChunk(jsonLine({ type: "agent_start" }));
		parser.pushChunk(jsonLine({ type: "turn_start" }));
		parser.pushChunk(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash", args: {} }),
		);
		now = 35;
		expect(parser.getSnapshot().progress).toEqual({
			state: "running",
			currentTool: "bash",
			toolCount: 0,
			turnCount: 1,
			elapsedMs: 25,
		});

		parser.pushChunk(
			jsonLine({
				type: "tool_execution_update",
				toolCallId: "tool-1",
				toolName: "bash",
				partialResult: {},
			}),
		);
		parser.pushChunk(
			jsonLine({
				type: "tool_execution_end",
				toolCallId: "tool-1",
				toolName: "bash",
				result: {},
				isError: false,
			}),
		);
		parser.pushChunk(
			jsonLine({
				type: "turn_end",
				message: { role: "assistant", content: [], stopReason: "end" },
				toolResults: [],
			}),
		);
		now = 60;
		parser.pushChunk(
			jsonLine({
				type: "agent_end",
				messages: [{ role: "assistant", content: [], stopReason: "end" }],
			}),
		);

		const snapshot = parser.getSnapshot();
		expect(snapshot.stopReason).toBe("end");
		expect(snapshot.progress).toEqual({
			state: "stopped",
			toolCount: 1,
			turnCount: 1,
			elapsedMs: 50,
		});
	});

	test("captures streaming assistant preview from visible assistant text", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "message_update",
				message: { role: "assistant", content: [{ type: "text", text: "Reading\nfiles" }] },
			}),
		);
		expect(parser.getSnapshot().activity.assistantPreview).toBe("Reading files");

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Done.\nEvidence: tests passed." }],
				},
			}),
		);
		expect(parser.getSnapshot().activity.assistantPreview).toBe("Done. Evidence: tests passed.");

		parser.pushChunk(
			jsonLine({
				type: "turn_end",
				message: { role: "assistant", content: [{ type: "text", text: "Turn final." }] },
			}),
		);
		expect(parser.getSnapshot().activity.assistantPreview).toBe("Turn final.");
	});

	test("ignores non-visible assistant activity blocks", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "message_update",
				message: { role: "user", content: [{ type: "text", text: "Nope." }] },
			}),
		);
		parser.pushChunk(
			jsonLine({
				type: "message_update",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", text: "private reasoning" },
						{ type: "toolCall", name: "bash", input: {} },
						null,
						{ type: "text", text: 42 },
					],
				},
			}),
		);

		expect(parser.getSnapshot().activity.assistantPreview).toBeUndefined();
	});

	test("captures current tool input and last tool result activity", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "tool_execution_start",
				toolCallId: "tool-1",
				toolName: "read",
				args: { path: "README.md" },
			}),
		);
		expect(parser.getSnapshot().activity.currentToolInputPreview).toBe('{"path":"README.md"}');

		parser.pushChunk(
			jsonLine({
				type: "tool_execution_update",
				toolCallId: "tool-1",
				toolName: "read",
				partialResult: {},
			}),
		);
		expect(parser.getSnapshot().activity.currentToolInputPreview).toBe('{"path":"README.md"}');

		parser.pushChunk(
			jsonLine({
				type: "tool_execution_update",
				toolCallId: "tool-1",
				toolName: "read",
				input: { path: "README.md", offset: 10 },
			}),
		);
		expect(parser.getSnapshot().activity.currentToolInputPreview).toBe(
			'{"path":"README.md","offset":10}',
		);

		parser.pushChunk(
			jsonLine({
				type: "tool_execution_end",
				toolCallId: "tool-1",
				toolName: "read",
				result: { content: [{ type: "text", text: "file contents\nline 2" }] },
				isError: false,
			}),
		);
		const activity = parser.getSnapshot().activity;
		expect(activity.currentToolInputPreview).toBeUndefined();
		expect(activity.lastToolName).toBe("read");
		expect(activity.lastToolResultPreview).toBe("file contents line 2");
		expect(activity.lastToolResultIsError).toBe(false);
	});

	test("records error tool result activity", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "tool_execution_start",
				toolCallId: "tool-1",
				toolName: "bash",
				args: { command: "exit 1" },
			}),
		);
		parser.pushChunk(
			jsonLine({
				type: "tool_execution_end",
				toolCallId: "tool-1",
				toolName: "bash",
				result: { content: [{ type: "text", text: "failed" }] },
				isError: true,
			}),
		);

		expect(parser.getSnapshot().activity).toEqual(
			expect.objectContaining({
				lastToolName: "bash",
				lastToolResultPreview: "failed",
				lastToolResultIsError: true,
			}),
		);
	});

	test("treats malformed JSONL as an error", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk('{"type":"agent_start"}\n{"type":');
		parser.finish();

		const snapshot = parser.getSnapshot();
		expect(snapshot.error?.name).toBe("RunnerSubagentJsonEventParserError");
		expect(snapshot.error?.message).toContain("Malformed runner subagent Pi JSONL output");
		expect(snapshot.progress.state).toBe("stopped");
	});

	test("treats parsed JSON values without a string event type as malformed JSONL", () => {
		for (const value of [{}, { type: 123 }, []]) {
			const parser = createRunnerSubagentJsonEventParser();

			parser.pushChunk(jsonLine(value));

			const snapshot = parser.getSnapshot();
			expect(snapshot.error?.name).toBe("RunnerSubagentJsonEventParserError");
			expect(snapshot.error?.message).toContain("Malformed runner subagent Pi JSONL output");
			expect(snapshot.progress.state).toBe("stopped");
		}
	});

	test("detects terminal tool calls mixed with sibling tools in the same turn", () => {
		const parser = createRunnerSubagentJsonEventParser({
			terminalToolNames: ["complete_runner_subagent"],
		});

		parser.pushChunk(jsonLine({ type: "turn_start" }));
		parser.pushChunk(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash", args: {} }),
		);
		parser.pushChunk(
			jsonLine({
				type: "tool_execution_start",
				toolCallId: "tool-2",
				toolName: "complete_runner_subagent",
				args: {},
			}),
		);

		const snapshot = parser.getSnapshot();
		expect(snapshot.terminalAttempted).toBe(true);
		expect(snapshot.protocolError?.message).toContain("mixed with sibling tool calls");
	});

	test("captures terminal execution errors without treating them as malformed JSONL", () => {
		const parser = createRunnerSubagentJsonEventParser({
			terminalToolNames: ["complete_runner_subagent"],
		});

		parser.pushChunk(jsonLine({ type: "turn_start" }));
		parser.pushChunk(
			jsonLine({
				type: "tool_execution_start",
				toolCallId: "tool-1",
				toolName: "complete_runner_subagent",
				args: {},
			}),
		);
		parser.pushChunk(
			jsonLine({
				type: "tool_execution_end",
				toolCallId: "tool-1",
				toolName: "complete_runner_subagent",
				isError: true,
			}),
		);

		const snapshot = parser.getSnapshot();
		expect(snapshot.error).toBeUndefined();
		expect(snapshot.terminalAttempted).toBe(true);
		expect(snapshot.terminalExecutionError).toEqual(
			expect.objectContaining({ toolName: "complete_runner_subagent", toolCallId: "tool-1" }),
		);
	});

	test("captures final assistant text from message_end text blocks", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Done.\nEvidence: tests passed." }],
					stopReason: "stop",
				},
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBe("Done.\nEvidence: tests passed.");
	});

	test("captures final assistant text from turn_end message", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "turn_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Turn answer." }],
					stopReason: "stop",
				},
				toolResults: [],
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBe("Turn answer.");
	});

	test("captures final assistant text from the last assistant in agent_end messages", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "agent_end",
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "Earlier answer." }] },
					{ role: "user", content: [{ type: "text", text: "Ignore me." }] },
					{
						role: "assistant",
						content: [{ type: "text", text: "Final answer." }],
						stopReason: "stop",
					},
				],
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBe("Final answer.");
	});

	test("ignores text from non-assistant messages", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: { role: "user", content: [{ type: "text", text: "Nope." }] },
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBeUndefined();
	});

	test("ignores thinking and tool-call content blocks", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						{ type: "thinking", text: "private reasoning" },
						{ type: "toolCall", name: "bash", input: {} },
						{ type: "text", text: "Visible answer." },
					],
				},
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBe("Visible answer.");
	});

	test("preserves the latest non-empty assistant text across turns", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: { role: "assistant", content: [{ type: "text", text: "First." }] },
			}),
		);
		parser.pushChunk(
			jsonLine({
				type: "turn_end",
				message: { role: "assistant", content: [{ type: "text", text: "Second." }] },
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBe("Second.");
	});

	test("does not clear final assistant text when later assistant content is empty", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: { role: "assistant", content: [{ type: "text", text: "Useful." }] },
			}),
		);
		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: { role: "assistant", content: [{ type: "text", text: "   " }] },
			}),
		);
		parser.pushChunk(jsonLine({ type: "turn_end", message: { role: "assistant", content: [] } }));

		expect(parser.getSnapshot().finalAssistantText).toBe("Useful.");
	});

	test("handles string and malformed content defensively", () => {
		const parser = createRunnerSubagentJsonEventParser();

		parser.pushChunk(
			jsonLine({ type: "message_end", message: { role: "assistant", content: "plain string" } }),
		);
		expect(parser.getSnapshot().error).toBeUndefined();
		expect(parser.getSnapshot().finalAssistantText).toBeUndefined();

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: {
					role: "assistant",
					content: [
						null,
						"bad",
						{ type: "text", text: 42 },
						{ type: "text", text: " Recovered. " },
					],
				},
			}),
		);

		expect(parser.getSnapshot().error).toBeUndefined();
		expect(parser.getSnapshot().finalAssistantText).toBe("Recovered.");
	});
});
