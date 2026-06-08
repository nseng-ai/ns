import { describe, expect, test } from "vitest";

import type { RunnerSubagentProgress, RunnerSubagentResult } from "../src/runner-subagent.ts";
import {
	formatRunnerSubagentElapsed,
	formatRunnerSubagentProgressWidgetLines,
	runnerSubagentDisplayTitle,
	runnerSubagentSessionFile,
	runnerSubagentSessionFileText,
} from "../src/runner-subagent/presentation.ts";

const PROGRESS: RunnerSubagentProgress = {
	title: "Progress title",
	state: "running",
	currentTool: "read",
	toolCount: 2,
	turnCount: 1,
	elapsedMs: 1_250,
	sessionFile: "/tmp/progress.jsonl",
};

const RESULT: RunnerSubagentResult = {
	status: "final-text",
	title: "Result title",
	elapsedMs: 1_250,
	progress: PROGRESS,
	sessionFile: "/tmp/result.jsonl",
	finalText: "Done.",
};

describe("runner subagent presentation helpers", () => {
	test("formats elapsed time consistently", () => {
		expect(formatRunnerSubagentElapsed(999)).toBe("999ms");
		expect(formatRunnerSubagentElapsed(1_250)).toBe("1.3s");
	});

	test("derives display titles from results and progress snapshots", () => {
		const resultWithoutTitle: RunnerSubagentResult = {
			status: "final-text",
			elapsedMs: 1_250,
			progress: PROGRESS,
			sessionFile: "/tmp/result.jsonl",
			finalText: "Done.",
		};
		const progressWithoutTitle: RunnerSubagentProgress = {
			state: "running",
			currentTool: "read",
			toolCount: 2,
			turnCount: 1,
			elapsedMs: 1_250,
			sessionFile: "/tmp/progress.jsonl",
		};

		expect(runnerSubagentDisplayTitle(RESULT)).toBe("Result title");
		expect(runnerSubagentDisplayTitle(resultWithoutTitle)).toBe("Progress title");
		expect(runnerSubagentDisplayTitle(progressWithoutTitle, "(untitled)")).toBe("(untitled)");
	});

	test("derives session files from results and progress snapshots", () => {
		const resultWithoutSessionFile: RunnerSubagentResult = {
			status: "final-text",
			title: "Result title",
			elapsedMs: 1_250,
			progress: PROGRESS,
			finalText: "Done.",
		};
		const progressWithoutSessionFile: RunnerSubagentProgress = {
			title: "Progress title",
			state: "running",
			currentTool: "read",
			toolCount: 2,
			turnCount: 1,
			elapsedMs: 1_250,
		};

		expect(runnerSubagentSessionFile(RESULT)).toBe("/tmp/result.jsonl");
		expect(runnerSubagentSessionFile(resultWithoutSessionFile)).toBe("/tmp/progress.jsonl");
		expect(runnerSubagentSessionFileText(progressWithoutSessionFile)).toBe("(not available)");
	});

	test("formats progress widget lines with optional elapsed display", () => {
		expect(formatRunnerSubagentProgressWidgetLines(PROGRESS)).toEqual([
			"Subagent: Progress title",
			"State: running",
			"Tool: read",
			"Turns/tools: 1/2",
			"Elapsed: 1.3s",
			"Session: /tmp/progress.jsonl",
		]);
		const progressWithoutTitle: RunnerSubagentProgress = {
			state: "running",
			currentTool: "read",
			toolCount: 2,
			turnCount: 1,
			elapsedMs: 1_250,
			sessionFile: "/tmp/progress.jsonl",
		};
		expect(formatRunnerSubagentProgressWidgetLines(progressWithoutTitle, { fallbackTitle: "(untitled)", includeElapsed: false })).toEqual([
			"Subagent: (untitled)",
			"State: running",
			"Tool: read",
			"Turns/tools: 1/2",
			"Session: /tmp/progress.jsonl",
		]);
	});
});
