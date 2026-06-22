import { describe, expect, test } from "vitest";

import type { RunnerSubagentUpdate } from "../src/runner-subagent.ts";
import {
	formatRunnerSubagentActivityWidgetLines,
	setRunnerSubagentWidget,
	withRunnerSubagentWidget,
} from "../src/runner-subagent/widget.ts";

const METADATA_ONLY_LAUNCH = {
	model: { provider: "anthropic", id: "claude-sonnet-4-5" },
	thinkingLevel: "medium",
	hasModelArg: true,
	hasThinkingArg: true,
} as const;

const METADATA_ONLY_UPDATE: RunnerSubagentUpdate = {
	progress: {
		title: "Progress title",
		state: "running",
		currentTool: "read",
		toolCount: 2,
		turnCount: 1,
		elapsedMs: 1_250,
		sessionFile: "/tmp/progress.jsonl",
		launch: METADATA_ONLY_LAUNCH,
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

	test("renders requested model patterns before observed child model events", () => {
		expect(
			formatRunnerSubagentActivityWidgetLines(
				{
					progress: {
						state: "starting",
						toolCount: 0,
						turnCount: 0,
						elapsedMs: 0,
						launch: {
							requestedModel: "openai-codex/gpt-5.4-mini:medium",
							thinkingLevel: "off",
							hasModelArg: true,
							hasThinkingArg: false,
						},
					},
					activity: {},
				},
				{ fallbackTitle: "(untitled)", includeElapsed: false },
			),
		).toEqual([
			"Subagent: (untitled)",
			"State: starting",
			"Model: openai-codex/gpt-5.4-mini:medium",
			"Thinking: default (unobserved)",
			"Turns/tools: 0/0",
		]);
	});

	test("renders intentional explicit off thinking as off", () => {
		expect(
			formatRunnerSubagentActivityWidgetLines(
				{
					progress: {
						state: "starting",
						toolCount: 0,
						turnCount: 0,
						elapsedMs: 0,
						launch: {
							requestedModel: "openai-codex/gpt-5.4-mini",
							thinkingLevel: "off",
							hasModelArg: true,
							hasThinkingArg: true,
						},
					},
					activity: {},
				},
				{ fallbackTitle: "(untitled)", includeElapsed: false },
			),
		).toContain("Thinking: off");
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
		).toEqual([
			"Subagent: (untitled)",
			"State: starting",
			"Model: default (not specified)",
			"Thinking: off",
			"Turns/tools: 0/0",
		]);
	});

	test("sets progress widgets and clears them after success", async () => {
		const records: Array<{ value: string[] | undefined }> = [];
		const result = await withRunnerSubagentWidget(
			{
				hasUI: true,
				ui: {
					setWidget(_key, value): void {
						records.push({ value });
					},
				},
			},
			"runner",
			{ title: "Lifecycle", launch: METADATA_ONLY_LAUNCH },
			async (onProgress) => {
				onProgress(METADATA_ONLY_UPDATE);
				return "done";
			},
		);

		expect(result).toBe("done");
		expect(records[0]?.value).toContain("Subagent: Lifecycle");
		expect(records.some((record) => record.value?.includes("Tool: read"))).toBe(true);
		expect(records.at(-1)).toEqual({ value: undefined });
	});

	test("clears progress widgets after failure", async () => {
		const records: Array<{ value: string[] | undefined }> = [];

		await expect(
			withRunnerSubagentWidget(
				{
					hasUI: true,
					ui: {
						setWidget(_key, value): void {
							records.push({ value });
						},
					},
				},
				"runner",
				{ title: "Lifecycle", launch: METADATA_ONLY_LAUNCH },
				async () => {
					throw new Error("boom");
				},
			),
		).rejects.toThrow("boom");
		expect(records.at(-1)).toEqual({ value: undefined });
	});

	test("ignores absent widget UI", () => {
		expect(() => setRunnerSubagentWidget({ hasUI: false }, "runner", ["line"])).not.toThrow();
		expect(() =>
			setRunnerSubagentWidget({ hasUI: true, ui: {} }, "runner", ["line"]),
		).not.toThrow();
	});
});
