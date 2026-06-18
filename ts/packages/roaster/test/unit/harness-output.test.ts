import { describe, expect, test } from "vitest";

import { parseClaudeCodeReviewOutput } from "../../src/gateways/harness-output.ts";
import type { ReviewInputCoverage } from "../../src/models.ts";

const coverage: ReviewInputCoverage = {
	fullDiffEstimatedTokens: 10,
	promptDiffTokenCap: 120_000,
	promptDiffFileTokenCap: 40_000,
	changedPathCount: 1,
	includedFileCount: 1,
	omittedFileCount: 0,
	omittedFiles: [],
};

function resultEvent(extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		type: "result",
		structured_output: {
			findings: [
				{
					path: "src/app.ts",
					line: 12,
					severity: "warning",
					summary: "Check this",
					details: "A concrete issue.",
				},
			],
		},
		total_cost_usd: 0.01,
		duration_ms: 123,
		num_turns: 1,
		usage: {
			input_tokens: 10,
			output_tokens: 5,
			cache_creation_input_tokens: 3,
			cache_read_input_tokens: 2,
		},
		...extra,
	};
}

describe("Claude Code review output parsing", () => {
	test("parses a single result object with structured findings and usage", () => {
		const parsed = parseClaudeCodeReviewOutput({
			stdout: JSON.stringify(resultEvent()),
			inputCoverage: coverage,
		});

		expect(parsed.type).toBe("ok");
		if (parsed.type === "ok") {
			expect(parsed.value.payload).toMatchObject({ format: "findings", count: 1 });
			expect(parsed.value.usage).toMatchObject({
				inputTokens: 10,
				outputTokens: 5,
				totalCostUsd: 0.01,
			});
			expect(parsed.value.inputCoverage).toEqual(coverage);
		}
	});

	test("parses an array of events by selecting the result event", () => {
		const parsed = parseClaudeCodeReviewOutput({
			stdout: JSON.stringify([{ type: "system" }, resultEvent()]),
			inputCoverage: null,
		});

		expect(parsed.type).toBe("ok");
	});

	test.each([
		{ stdout: "", failureType: "review_execution_empty_output" },
		{ stdout: "not json", failureType: "review_execution_invalid_json" },
		{
			stdout: JSON.stringify(["bad-event", resultEvent()]),
			failureType: "review_execution_invalid_response",
		},
		{
			stdout: JSON.stringify([{ type: "system" }]),
			failureType: "review_execution_invalid_response",
		},
		{ stdout: JSON.stringify(7), failureType: "review_execution_invalid_response" },
	])("maps malformed output to $failureType", ({ stdout, failureType }) => {
		const parsed = parseClaudeCodeReviewOutput({ stdout, inputCoverage: null });

		expect(parsed.type).toBe("error");
		if (parsed.type === "error") {
			expect(parsed.error.type).toBe(failureType);
		}
	});

	test("reports prose result with schema guidance when structured output is missing", () => {
		const parsed = parseClaudeCodeReviewOutput({
			stdout: JSON.stringify({ type: "result", result: "x".repeat(600) }),
			inputCoverage: null,
		});

		expect(parsed.type).toBe("error");
		if (parsed.type === "error") {
			expect(parsed.error.type).toBe("review_execution_invalid_response");
			expect(parsed.error.message).toContain("Confirm --json-schema is honored");
			expect(parsed.error.message.length).toBeLessThan(650);
		}
	});

	test("malformed usage degrades to null without failing findings", () => {
		const parsed = parseClaudeCodeReviewOutput({
			stdout: JSON.stringify(resultEvent({ usage: { input_tokens: "bad" } })),
			inputCoverage: null,
		});

		expect(parsed.type).toBe("ok");
		if (parsed.type === "ok") {
			expect(parsed.value.usage).toBeNull();
			expect(parsed.value.payload.count).toBe(1);
		}
	});

	test("invalid structured findings return invalid findings", () => {
		const parsed = parseClaudeCodeReviewOutput({
			stdout: JSON.stringify(
				resultEvent({
					structured_output: {
						findings: [{ path: "", line: null, severity: "warning", summary: "x", details: "y" }],
					},
				}),
			),
			inputCoverage: null,
		});

		expect(parsed.type).toBe("error");
		if (parsed.type === "error") {
			expect(parsed.error.type).toBe("review_execution_invalid_findings");
		}
	});
});
