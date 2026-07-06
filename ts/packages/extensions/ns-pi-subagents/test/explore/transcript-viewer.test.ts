import { describe, expect, test } from "vitest";

import type { RunnerSubagentFleetTaskSnapshot } from "@internal/pi-tools/runner-subagents";
import {
	parseExploreTranscript,
	renderTranscriptMarkdown,
} from "../../src/explore/transcript-viewer.ts";

const task: RunnerSubagentFleetTaskSnapshot = {
	id: "task-1",
	runId: "run-1",
	index: 0,
	title: "Scout transcript",
	state: "done",
	finalStatus: "final-text",
	sessionFile: "/tmp/scout.jsonl",
};

describe("explore transcript viewer", () => {
	test("parses assistant text and tool summary from child JSONL", () => {
		const jsonl = [
			JSON.stringify({ type: "session", file: "/tmp/scout.jsonl" }),
			JSON.stringify({ type: "turn_start" }),
			JSON.stringify({ type: "tool_execution_start", toolName: "read", toolCallId: "tool-1" }),
			JSON.stringify({
				type: "tool_execution_end",
				toolName: "read",
				toolCallId: "tool-1",
				output: "file contents",
			}),
			JSON.stringify({
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "## Findings\nUse src/explore." }],
					stopReason: "stop",
				},
			}),
		].join("\n");

		const transcript = parseExploreTranscript({ task, jsonl });
		expect(transcript.title).toBe("Scout transcript");
		expect(transcript.entries.map((entry) => entry.type)).toContain("assistant");
		expect(renderTranscriptMarkdown(transcript, 80)).toContain("Use src/explore.");
		expect(renderTranscriptMarkdown(transcript, 80)).toContain("turns=1, tools=1");
	});
});
