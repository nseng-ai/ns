import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { summarizeRunnerSubagentSessionFile, summarizeRunnerSubagentUsage } from "../../src/operations/runner-subagent-usage.ts";

describe("runner subagent usage summaries", () => {
	test("summarizes multiple assistant usage messages", async () => {
		const sessionFile = await writeJsonl(
			"slice.jsonl",
			assistantRecord({
				inputTokens: 100,
				outputTokens: 20,
				cacheReadTokens: 10,
				cacheWriteTokens: 5,
				totalTokens: 135,
				costInput: 0.01,
				costOutput: 0.02,
				costCacheRead: 0.003,
				costCacheWrite: 0.004,
				costTotal: 0.037,
			}),
			assistantRecord({
				inputTokens: 200,
				outputTokens: 30,
				cacheReadTokens: 0,
				cacheWriteTokens: 7,
				totalTokens: 237,
				costInput: 0.02,
				costOutput: 0.03,
				costCacheRead: 0,
				costCacheWrite: 0.007,
				costTotal: 0.057,
			}),
		);

		const summary = await summarizeRunnerSubagentSessionFile(sessionFile);

		expect(summary.status).toBe("ok");
		expect(summary.assistant_response_count).toBe(2);
		expect(summary.tokens).toEqual({
			input_tokens: 300,
			output_tokens: 50,
			cache_read_tokens: 10,
			cache_write_tokens: 12,
			total_tokens: 372,
		});
		expect(summary.cost.input_usd).toBeCloseTo(0.03);
		expect(summary.cost.output_usd).toBeCloseTo(0.05);
		expect(summary.cost.cache_read_usd).toBeCloseTo(0.003);
		expect(summary.cost.cache_write_usd).toBeCloseTo(0.011);
		expect(summary.cost.total_usd).toBeCloseTo(0.094);
		expect(summary.peak_observed_total_tokens).toBe(237);
		expect(summary.peak_observed_prompt_tokens).toBe(207);
		expect(summary.configured_context_window_tokens).toBeNull();
		expect(summary.models).toEqual([{ provider: "openai-codex", api: "responses", model: "gpt-5.5" }]);
	});

	test("ignores non-assistant messages and assistant messages without usage", async () => {
		const sessionFile = await writeJsonl(
			"slice.jsonl",
			{ message: { role: "user", usage: usage({ inputTokens: 999, totalTokens: 999 }) } },
			{ message: { role: "tool", usage: usage({ inputTokens: 888, totalTokens: 888 }) } },
			{ message: { role: "assistant", content: "no usage" } },
			assistantRecord({ inputTokens: 11, outputTokens: 7, totalTokens: 18 }),
		);

		const summary = await summarizeRunnerSubagentSessionFile(sessionFile);

		expect(summary.status).toBe("ok");
		expect(summary.assistant_response_count).toBe(1);
		expect(summary.tokens.input_tokens).toBe(11);
		expect(summary.tokens.output_tokens).toBe(7);
		expect(summary.tokens.total_tokens).toBe(18);
	});

	test("deduplicates model references preserving first-seen order", async () => {
		const sessionFile = await writeJsonl(
			"slice.jsonl",
			assistantRecord({ provider: "provider-a", api: "responses", model: "model-a" }),
			assistantRecord({ provider: "provider-a", api: "responses", model: "model-a" }),
			assistantRecord({ provider: "anthropic", api: "messages", model: "claude-sonnet" }),
		);

		const summary = await summarizeRunnerSubagentSessionFile(sessionFile);

		expect(summary.models).toEqual([
			{ provider: "provider-a", api: "responses", model: "model-a" },
			{ provider: "anthropic", api: "messages", model: "claude-sonnet" },
		]);
	});

	test("reports missing files, directories, invalid JSON, and no-usage sessions", async () => {
		const root = await mkdtemp(join(tmpdir(), "objective-runner-usage-statuses-"));
		const directoryPath = join(root, "directory");
		await mkdir(directoryPath);
		const invalidJsonPath = join(root, "broken.jsonl");
		await writeFile(invalidJsonPath, `${JSON.stringify(assistantRecord({ inputTokens: 100, totalTokens: 100 }))}\n\n{not json}\n`, "utf8");
		const noUsagePath = join(root, "no-usage.jsonl");
		await writeJsonlAt(noUsagePath, { message: { role: "user", content: "hello" } }, { message: { role: "assistant", content: "hello" } }, { event: "unknown" });

		const missing = await summarizeRunnerSubagentSessionFile(join(root, "missing.jsonl"));
		const directory = await summarizeRunnerSubagentSessionFile(directoryPath);
		const invalidJson = await summarizeRunnerSubagentSessionFile(invalidJsonPath);
		const noUsage = await summarizeRunnerSubagentSessionFile(noUsagePath);

		expect(missing).toMatchObject({ status: "missing", assistant_response_count: 0, tokens: { total_tokens: 0 }, cost: { total_usd: 0 } });
		expect(directory).toMatchObject({ status: "not_file", assistant_response_count: 0, tokens: { total_tokens: 0 } });
		expect(invalidJson.status).toBe("invalid_json");
		expect(invalidJson.error_line).toBe(3);
		expect(invalidJson.error).toContain("invalid JSON");
		expect(invalidJson.assistant_response_count).toBe(0);
		expect(noUsage).toMatchObject({ status: "no_usage", assistant_response_count: 0, tokens: { total_tokens: 0 } });
		expect(noUsage.peak_observed_total_tokens).toBeNull();
		expect(noUsage.peak_observed_prompt_tokens).toBeNull();
	});

	test("aggregates only ok sessions", async () => {
		const okFile = await writeJsonl("ok.jsonl", assistantRecord({ inputTokens: 40, outputTokens: 5, cacheReadTokens: 9, totalTokens: 54 }));
		const noUsageFile = await writeJsonl("no-usage.jsonl", { message: { role: "assistant", content: "no usage" } });
		const missingFile = join(await mkdtemp(join(tmpdir(), "objective-runner-usage-missing-")), "missing.jsonl");

		const result = await summarizeRunnerSubagentUsage([okFile, noUsageFile, missingFile]);

		expect(result.sessions.map((session) => session.status)).toEqual(["ok", "no_usage", "missing"]);
		expect(result.aggregate.session_count).toBe(3);
		expect(result.aggregate.ok_session_count).toBe(1);
		expect(result.aggregate.usage_response_count).toBe(1);
		expect(result.aggregate.tokens.input_tokens).toBe(40);
		expect(result.aggregate.tokens.output_tokens).toBe(5);
		expect(result.aggregate.tokens.cache_read_tokens).toBe(9);
		expect(result.aggregate.tokens.total_tokens).toBe(54);
		expect(result.aggregate.peak_observed_total_tokens).toBe(54);
		expect(result.aggregate.peak_observed_prompt_tokens).toBe(49);
	});
});

async function writeJsonl(name: string, ...records: readonly unknown[]): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "objective-runner-usage-"));
	const path = join(root, name);
	await writeJsonlAt(path, ...records);
	return path;
}

async function writeJsonlAt(path: string, ...records: readonly unknown[]): Promise<void> {
	await writeFile(path, records.map((record) => `${JSON.stringify(record)}\n`).join(""), "utf8");
}

interface AssistantRecordOptions {
	readonly provider?: string | undefined;
	readonly api?: string | undefined;
	readonly model?: string | undefined;
	readonly inputTokens?: number | undefined;
	readonly outputTokens?: number | undefined;
	readonly cacheReadTokens?: number | undefined;
	readonly cacheWriteTokens?: number | undefined;
	readonly totalTokens?: number | undefined;
	readonly costInput?: number | undefined;
	readonly costOutput?: number | undefined;
	readonly costCacheRead?: number | undefined;
	readonly costCacheWrite?: number | undefined;
	readonly costTotal?: number | undefined;
}

function assistantRecord(options: AssistantRecordOptions = {}): Record<string, unknown> {
	return {
		message: {
			role: "assistant",
			provider: options.provider ?? "openai-codex",
			api: options.api ?? "responses",
			model: options.model ?? "gpt-5.5",
			usage: usage(options),
		},
	};
}

function usage(options: AssistantRecordOptions = {}): Record<string, unknown> {
	return {
		input: options.inputTokens ?? 0,
		output: options.outputTokens ?? 0,
		cacheRead: options.cacheReadTokens ?? 0,
		cacheWrite: options.cacheWriteTokens ?? 0,
		totalTokens: options.totalTokens ?? 0,
		cost: {
			input: options.costInput ?? 0,
			output: options.costOutput ?? 0,
			cacheRead: options.costCacheRead ?? 0,
			cacheWrite: options.costCacheWrite ?? 0,
			total: options.costTotal ?? 0,
		},
	};
}
