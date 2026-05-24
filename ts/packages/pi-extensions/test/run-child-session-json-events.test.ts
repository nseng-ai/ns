import { describe, expect, test } from "bun:test";

import { createChildSessionJsonEventParser } from "../src/run-child-session/json-events.ts";

function jsonLine(value: unknown): string {
	return `${JSON.stringify(value)}\n`;
}

describe("child session JSON event parser", () => {
	test("parses chunked JSONL and captures the session header", () => {
		let now = 1_000;
		const parser = createChildSessionJsonEventParser({ title: "Child", sessionFile: "/tmp/child.jsonl", now: () => now });
		const header = { type: "session", version: 3, id: "session-id", timestamp: "2026-05-23T00:00:00Z", cwd: "/repo" } as const;
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

	test("tracks agent, turn, tool, elapsed, and stop-reason progress", () => {
		let now = 10;
		const parser = createChildSessionJsonEventParser({ now: () => now });

		parser.pushChunk(jsonLine({ type: "agent_start" }));
		parser.pushChunk(jsonLine({ type: "turn_start" }));
		parser.pushChunk(jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash", args: {} }));
		now = 35;
		expect(parser.getSnapshot().progress).toEqual({
			state: "running",
			currentTool: "bash",
			toolCount: 0,
			turnCount: 1,
			elapsedMs: 25,
		});

		parser.pushChunk(jsonLine({ type: "tool_execution_update", toolCallId: "tool-1", toolName: "bash", partialResult: {} }));
		parser.pushChunk(jsonLine({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "bash", result: {}, isError: false }));
		parser.pushChunk(
			jsonLine({
				type: "turn_end",
				message: { role: "assistant", content: [], stopReason: "end" },
				toolResults: [],
			}),
		);
		now = 60;
		parser.pushChunk(jsonLine({ type: "agent_end", messages: [{ role: "assistant", content: [], stopReason: "end" }] }));

		const snapshot = parser.getSnapshot();
		expect(snapshot.stopReason).toBe("end");
		expect(snapshot.progress).toEqual({
			state: "stopped",
			toolCount: 1,
			turnCount: 1,
			elapsedMs: 50,
		});
	});

	test("treats malformed JSONL as an error", () => {
		const parser = createChildSessionJsonEventParser();

		parser.pushChunk('{"type":"agent_start"}\n{"type":');
		parser.finish();

		const snapshot = parser.getSnapshot();
		expect(snapshot.error?.name).toBe("ChildSessionJsonEventParserError");
		expect(snapshot.error?.message).toContain("Malformed child Pi JSONL output");
		expect(snapshot.progress.state).toBe("stopped");
	});

	test("detects terminal tool calls mixed with sibling tools in the same turn", () => {
		const parser = createChildSessionJsonEventParser({ terminalToolNames: ["complete_child_session"] });

		parser.pushChunk(jsonLine({ type: "turn_start" }));
		parser.pushChunk(jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash", args: {} }));
		parser.pushChunk(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-2", toolName: "complete_child_session", args: {} }),
		);

		const snapshot = parser.getSnapshot();
		expect(snapshot.terminalAttempted).toBe(true);
		expect(snapshot.protocolError?.message).toContain("mixed with sibling tool calls");
	});

	test("captures terminal execution errors without treating them as malformed JSONL", () => {
		const parser = createChildSessionJsonEventParser({ terminalToolNames: ["complete_child_session"] });

		parser.pushChunk(jsonLine({ type: "turn_start" }));
		parser.pushChunk(
			jsonLine({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "complete_child_session", args: {} }),
		);
		parser.pushChunk(
			jsonLine({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "complete_child_session", isError: true }),
		);

		const snapshot = parser.getSnapshot();
		expect(snapshot.error).toBeUndefined();
		expect(snapshot.terminalAttempted).toBe(true);
		expect(snapshot.terminalExecutionError).toEqual(
			expect.objectContaining({ toolName: "complete_child_session", toolCallId: "tool-1" }),
		);
	});

	test("captures final assistant text from message_end text blocks", () => {
		const parser = createChildSessionJsonEventParser();

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
		const parser = createChildSessionJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "turn_end",
				message: { role: "assistant", content: [{ type: "text", text: "Turn answer." }], stopReason: "stop" },
				toolResults: [],
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBe("Turn answer.");
	});

	test("captures final assistant text from the last assistant in agent_end messages", () => {
		const parser = createChildSessionJsonEventParser();

		parser.pushChunk(
			jsonLine({
				type: "agent_end",
				messages: [
					{ role: "assistant", content: [{ type: "text", text: "Earlier answer." }] },
					{ role: "user", content: [{ type: "text", text: "Ignore me." }] },
					{ role: "assistant", content: [{ type: "text", text: "Final answer." }], stopReason: "stop" },
				],
			}),
		);

		expect(parser.getSnapshot().finalAssistantText).toBe("Final answer.");
	});

	test("ignores text from non-assistant messages", () => {
		const parser = createChildSessionJsonEventParser();

		parser.pushChunk(jsonLine({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "Nope." }] } }));

		expect(parser.getSnapshot().finalAssistantText).toBeUndefined();
	});

	test("ignores thinking and tool-call content blocks", () => {
		const parser = createChildSessionJsonEventParser();

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
		const parser = createChildSessionJsonEventParser();

		parser.pushChunk(jsonLine({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "First." }] } }));
		parser.pushChunk(jsonLine({ type: "turn_end", message: { role: "assistant", content: [{ type: "text", text: "Second." }] } }));

		expect(parser.getSnapshot().finalAssistantText).toBe("Second.");
	});

	test("does not clear final assistant text when later assistant content is empty", () => {
		const parser = createChildSessionJsonEventParser();

		parser.pushChunk(jsonLine({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Useful." }] } }));
		parser.pushChunk(jsonLine({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "   " }] } }));
		parser.pushChunk(jsonLine({ type: "turn_end", message: { role: "assistant", content: [] } }));

		expect(parser.getSnapshot().finalAssistantText).toBe("Useful.");
	});

	test("handles string and malformed content defensively", () => {
		const parser = createChildSessionJsonEventParser();

		parser.pushChunk(jsonLine({ type: "message_end", message: { role: "assistant", content: "plain string" } }));
		expect(parser.getSnapshot().error).toBeUndefined();
		expect(parser.getSnapshot().finalAssistantText).toBeUndefined();

		parser.pushChunk(
			jsonLine({
				type: "message_end",
				message: { role: "assistant", content: [null, "bad", { type: "text", text: 42 }, { type: "text", text: " Recovered. " }] },
			}),
		);

		expect(parser.getSnapshot().error).toBeUndefined();
		expect(parser.getSnapshot().finalAssistantText).toBe("Recovered.");
	});
});
