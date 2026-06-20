import { describe, expect, test } from "vitest";

import {
	addRuntimeRunnerSubagentUsageCostTotals,
	addRuntimeRunnerSubagentUsageTotals,
	parseRunnerSubagentUsageJsonl,
} from "../src/runner-subagent-usage.ts";

describe("runner subagent usage parsing", () => {
	test("extracts token and cost totals from assistant messages", () => {
		const result = parseRunnerSubagentUsageJsonl(
			jsonl(
				{ type: "message", message: { role: "user", usage: { input: 999, totalTokens: 999 } } },
				{
					type: "message",
					message: {
						role: "assistant",
						usage: {
							input: 100,
							output: 20,
							cacheRead: 30,
							cacheWrite: 5,
							totalTokens: 155,
							cost: {
								input: 0.001,
								output: 0.002,
								cacheRead: 0.003,
								cacheWrite: 0.004,
								total: 0.01,
							},
						},
					},
				},
			),
		);

		expect(result).toEqual({
			type: "ok",
			records: [
				{
					tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5, totalTokens: 155 },
					cost: { input: 0.001, output: 0.002, cacheRead: 0.003, cacheWrite: 0.004, total: 0.01 },
					model: { provider: null, api: null, model: null },
					peakTotalTokens: 155,
					peakPromptTokens: 135,
				},
			],
		});
	});

	test("extracts model references from direct and nested fields", () => {
		const result = parseRunnerSubagentUsageJsonl(
			jsonl(
				{
					message: {
						role: "assistant",
						provider: "direct-provider",
						usage: { input: 1, modelInfo: { model: "usage-model" } },
					},
				},
				{
					message: { role: "assistant", usage: { totalTokens: 2 } },
					model_ref: { api: "responses", model: "record-model" },
				},
			),
		);

		expect(result.type).toBe("ok");
		if (result.type !== "ok") return;
		expect(result.records.map((record) => record.model)).toEqual([
			{ provider: "direct-provider", api: null, model: "usage-model" },
			{ provider: null, api: "responses", model: "record-model" },
		]);
	});

	test("accepts historical records without a type field", () => {
		expect(
			parseRunnerSubagentUsageJsonl(
				jsonl({ message: { role: "assistant", usage: { output: 3 } } }),
			),
		).toMatchObject({
			type: "ok",
			records: [{ tokens: { output: 3 } }],
		});
	});

	test("reports malformed JSON using physical line numbers and ignores blank lines", () => {
		const result = parseRunnerSubagentUsageJsonl(
			`\n${JSON.stringify({ message: { role: "assistant", usage: { input: 1 } } })}\n\n{bad json}\n`,
		);

		expect(result).toMatchObject({ type: "invalid-json", line: 4 });
		if (result.type === "invalid-json") expect(result.message).not.toBe("");
	});

	test("returns ok with no records when no usage is present", () => {
		expect(
			parseRunnerSubagentUsageJsonl(
				jsonl({ type: "message", message: { role: "assistant", content: [] } }),
			),
		).toEqual({
			type: "ok",
			records: [],
		});
	});

	test("adds token and cost totals", () => {
		expect(
			addRuntimeRunnerSubagentUsageTotals(
				{ input: 1, output: 2, cacheRead: 3, cacheWrite: 4, totalTokens: 10 },
				{ input: 5, output: 6, cacheRead: 7, cacheWrite: 8, totalTokens: 26 },
			),
		).toEqual({ input: 6, output: 8, cacheRead: 10, cacheWrite: 12, totalTokens: 36 });
		expect(
			addRuntimeRunnerSubagentUsageCostTotals(
				{ input: 0.1, output: 0.2, cacheRead: 0.3, cacheWrite: 0.4, total: 1 },
				{ input: 0.5, output: 0.6, cacheRead: 0.7, cacheWrite: 0.8, total: 2.6 },
			),
		).toEqual({
			input: 0.6,
			output: 0.8,
			cacheRead: 1,
			cacheWrite: 1.2000000000000002,
			total: 3.6,
		});
	});
});

function jsonl(...records: readonly unknown[]): string {
	return records.map((record) => `${JSON.stringify(record)}\n`).join("");
}
