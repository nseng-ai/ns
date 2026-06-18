import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("objective exec runner-subagent-usage", () => {
	test("emits TS-native JSON usage summaries", async () => {
		const sessionFile = await writeRunnerSubagentJsonl();
		const run = runScenario(["exec", "runner-subagent-usage", sessionFile, "--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				sessions: [
					{
						sessionFile: sessionFile,
						status: "ok",
						error: null,
						errorLine: null,
						assistantResponseCount: 1,
						models: [{ provider: "openai-codex", api: "responses", model: "gpt-5.5" }],
						tokens: {
							inputTokens: 100,
							outputTokens: 20,
							cacheReadTokens: 30,
							cacheWriteTokens: 0,
							totalTokens: 150,
						},
						cost: {
							inputUsd: 0.001,
							outputUsd: 0.002,
							cacheReadUsd: 0.003,
							cacheWriteUsd: 0,
							totalUsd: 0.006,
						},
						peakObservedTotalTokens: 150,
						peakObservedPromptTokens: 130,
						configuredContextWindowTokens: null,
					},
				],
				aggregate: {
					sessionCount: 1,
					okSessionCount: 1,
					usageResponseCount: 1,
					tokens: {
						inputTokens: 100,
						outputTokens: 20,
						cacheReadTokens: 30,
						cacheWriteTokens: 0,
						totalTokens: 150,
					},
					cost: {
						inputUsd: 0.001,
						outputUsd: 0.002,
						cacheReadUsd: 0.003,
						cacheWriteUsd: 0,
						totalUsd: 0.006,
					},
					peakObservedTotalTokens: 150,
					peakObservedPromptTokens: 130,
					configuredContextWindowTokens: null,
				},
			},
		});
		expect(run.stderr).toEqual([]);
	});

	test("renders Markdown table and aggregate summary", async () => {
		const sessionFile = await writeRunnerSubagentJsonl();
		const run = runScenario(["exec", "runner-subagent-usage", sessionFile, "--format", "md"]);

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("# Runner Subagent Usage");
		expect(output).toContain(
			"| session | status | responses | model(s) | input | output | cache read |",
		);
		expect(output).toContain(sessionFile);
		expect(output).toContain("openai-codex/responses/gpt-5.5");
		expect(output).toContain("| 100 | 20 | 30 | 0 | 150 | 150 | 130 | $0.006000 |");
		expect(output).toContain("## Aggregate");
		expect(output).toContain("- sessions: 1 total, 1 with usage");
		expect(output).toContain("- configured context window: unavailable in runner subagent logs");
		expect(output).toContain("- cost: $0.006000");
		expect(run.stderr).toEqual([]);
	});

	test("missing args return a negative canonical JSON envelope", async () => {
		const run = runScenario(["exec", "runner-subagent-usage", "--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message:
				"Missing session file (missing_session_file). Pass at least one Pi runner subagent JSONL file.",
			data: {
				sessions: [],
				aggregate: {
					sessionCount: 0,
					okSessionCount: 0,
					usageResponseCount: 0,
					tokens: {
						inputTokens: 0,
						outputTokens: 0,
						cacheReadTokens: 0,
						cacheWriteTokens: 0,
						totalTokens: 0,
					},
					cost: { inputUsd: 0, outputUsd: 0, cacheReadUsd: 0, cacheWriteUsd: 0, totalUsd: 0 },
					peakObservedTotalTokens: null,
					peakObservedPromptTokens: null,
					configuredContextWindowTokens: null,
				},
			},
		});
		expect(run.stderr).toEqual([]);
	});

	test("help describes the runner usage command", async () => {
		const run = runScenario(["exec", "runner-subagent-usage", "--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain("Usage: objective exec runner-subagent-usage");
		expect(run.stdout.join("")).toContain("Summarize Pi runner subagent JSONL usage telemetry");
	});
});

async function writeRunnerSubagentJsonl(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "objective-runner-usage-cli-"));
	const path = join(root, "slice.jsonl");
	await writeFile(
		path,
		`${JSON.stringify({
			message: {
				role: "assistant",
				provider: "openai-codex",
				api: "responses",
				model: "gpt-5.5",
				usage: {
					input: 100,
					output: 20,
					cacheRead: 30,
					cacheWrite: 0,
					totalTokens: 150,
					cost: {
						input: 0.001,
						output: 0.002,
						cacheRead: 0.003,
						cacheWrite: 0,
						total: 0.006,
					},
				},
			},
		})}\n`,
		"utf8",
	);
	return path;
}
