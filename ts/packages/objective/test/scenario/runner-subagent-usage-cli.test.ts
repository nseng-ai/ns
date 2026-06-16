import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

describe("objective exec runner-subagent-usage", () => {
	test("emits Python-compatible JSON usage summaries", async () => {
		const sessionFile = await writeRunnerSubagentJsonl();
		const run = runScenario(["exec", "runner-subagent-usage", sessionFile, "--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: {
				sessions: [
					{
						session_file: sessionFile,
						status: "ok",
						error: null,
						error_line: null,
						assistant_response_count: 1,
						models: [{ provider: "openai-codex", api: "responses", model: "gpt-5.5" }],
						tokens: {
							input_tokens: 100,
							output_tokens: 20,
							cache_read_tokens: 30,
							cache_write_tokens: 0,
							total_tokens: 150,
						},
						cost: {
							input_usd: 0.001,
							output_usd: 0.002,
							cache_read_usd: 0.003,
							cache_write_usd: 0,
							total_usd: 0.006,
						},
						peak_observed_total_tokens: 150,
						peak_observed_prompt_tokens: 130,
						configured_context_window_tokens: null,
					},
				],
				aggregate: {
					session_count: 1,
					ok_session_count: 1,
					usage_response_count: 1,
					tokens: {
						input_tokens: 100,
						output_tokens: 20,
						cache_read_tokens: 30,
						cache_write_tokens: 0,
						total_tokens: 150,
					},
					cost: {
						input_usd: 0.001,
						output_usd: 0.002,
						cache_read_usd: 0.003,
						cache_write_usd: 0,
						total_usd: 0.006,
					},
					peak_observed_total_tokens: 150,
					peak_observed_prompt_tokens: 130,
					configured_context_window_tokens: null,
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
		expect(output).toContain("| session | status | responses | model(s) | input | output | cache read |");
		expect(output).toContain(sessionFile);
		expect(output).toContain("openai-codex/responses/gpt-5.5");
		expect(output).toContain("| 100 | 20 | 30 | 0 | 150 | 150 | 130 | $0.006000 |");
		expect(output).toContain("## Aggregate");
		expect(output).toContain("- sessions: 1 total, 1 with usage");
		expect(output).toContain("- configured context window: unavailable in runner subagent logs");
		expect(output).toContain("- cost: $0.006000");
		expect(run.stderr).toEqual([]);
	});

	test("missing args return a negative compatibility JSON envelope", async () => {
		const run = runScenario(["exec", "runner-subagent-usage", "--format", "json"]);

		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 1,
			message: "Missing session file (missing_session_file). Pass at least one Pi runner subagent JSONL file.",
			data: {
				sessions: [],
				aggregate: {
					session_count: 0,
					ok_session_count: 0,
					usage_response_count: 0,
					tokens: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, total_tokens: 0 },
					cost: { input_usd: 0, output_usd: 0, cache_read_usd: 0, cache_write_usd: 0, total_usd: 0 },
					peak_observed_total_tokens: null,
					peak_observed_prompt_tokens: null,
					configured_context_window_tokens: null,
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
