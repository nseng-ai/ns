import { describe, expect, test } from "bun:test";

import type { RunnerSubagentUpdate } from "../src/runner-subagent.ts";
import { formatRunnerSubagentActivityWidgetLines } from "../src/runner-subagent/widget.ts";

const METADATA_ONLY_UPDATE: RunnerSubagentUpdate = {
	progress: {
		title: "Progress title",
		state: "running",
		currentTool: "read",
		toolCount: 2,
		turnCount: 1,
		elapsedMs: 1_250,
		sessionFile: "/tmp/progress.jsonl",
		launch: {
			model: { provider: "anthropic", id: "claude-sonnet-4-5" },
			thinkingLevel: "medium",
			hasModelArg: true,
			hasThinkingArg: true,
		},
	},
	activity: {},
};

describe("runner subagent activity widget", () => {
	test("renders metadata-only updates like the compact progress widget", () => {
		expect(formatRunnerSubagentActivityWidgetLines(METADATA_ONLY_UPDATE)).toEqual([
			"Subagent: Progress title",
			"State: running",
			"Model: anthropic/claude-sonnet-4-5",
			"Thinking: medium",
			"Tool: read",
			"Turns/tools: 1/2",
			"Elapsed: 1.3s",
			"Session: /tmp/progress.jsonl",
		]);
	});

	test("renders assistant, input, and last-result activity lines", () => {
		expect(
			formatRunnerSubagentActivityWidgetLines({
				progress: METADATA_ONLY_UPDATE.progress,
				activity: {
					assistantPreview: "Reading files now",
					currentToolInputPreview: '{"path":"README.md"}',
					lastToolName: "bash",
					lastToolResultPreview: "tests passed",
				},
			}),
		).toEqual([
			"Subagent: Progress title",
			"State: running",
			"Model: anthropic/claude-sonnet-4-5",
			"Thinking: medium",
			"Assistant: Reading files now",
			"Tool: read",
			'Input: {"path":"README.md"}',
			"Last result (bash): tests passed",
			"Turns/tools: 1/2",
			"Elapsed: 1.3s",
			"Session: /tmp/progress.jsonl",
		]);
	});

	test("renders error results as Last error", () => {
		expect(
			formatRunnerSubagentActivityWidgetLines({
				progress: METADATA_ONLY_UPDATE.progress,
				activity: {
					lastToolName: "bash",
					lastToolResultPreview: "exit code 1",
					lastToolResultIsError: true,
				},
			}),
		).toContain("Last error (bash): exit code 1");
	});

	test("omits missing optional activity fields", () => {
		expect(
			formatRunnerSubagentActivityWidgetLines(
				{
					progress: {
						state: "starting",
						toolCount: 0,
						turnCount: 0,
						elapsedMs: 0,
					},
					activity: {},
				},
				{ fallbackTitle: "(untitled)", includeElapsed: false },
			),
		).toEqual(["Subagent: (untitled)", "State: starting", "Turns/tools: 0/0"]);
	});

	test("renders honest default model and off thinking metadata", () => {
		expect(
			formatRunnerSubagentActivityWidgetLines(
				{
					progress: {
						state: "starting",
						toolCount: 0,
						turnCount: 0,
						elapsedMs: 0,
						launch: {
							thinkingLevel: "off",
							hasModelArg: false,
							hasThinkingArg: false,
						},
					},
					activity: {},
				},
				{ fallbackTitle: "(untitled)", includeElapsed: false },
			),
		).toEqual(["Subagent: (untitled)", "State: starting", "Model: default (not specified)", "Thinking: off", "Turns/tools: 0/0"]);
	});
});
