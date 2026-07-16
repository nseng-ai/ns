import { describe, expect, it } from "vitest";

import {
	buildReviewAggregationJsonSchema,
	parseClaudeCodeAggregationOutput,
	parseCodexAggregationOutput,
} from "../../src/gateways/review-aggregation-output.ts";

const finding = {
	reviewKey: "correctness",
	occurrence: 0,
	path: "src/a.ts",
	line: 1,
	severity: "error" as const,
	summary: "Issue",
	details: "Details",
};
const payload = {
	clusters: [
		{
			findings: [finding],
			recommendationConflict: false,
			conflictExplanation: null,
			disposition: "fix" as const,
		},
	],
};

describe("review aggregation structured output", () => {
	it("builds a strict proposal-only schema", () => {
		const schema = buildReviewAggregationJsonSchema();
		expect(schema.$schema).toBeUndefined();
		expect(schema).toMatchObject({ type: "object", additionalProperties: false });
	});

	it("parses Claude structured_output and Codex payloads", () => {
		expect(
			parseClaudeCodeAggregationOutput(
				JSON.stringify({ type: "result", structured_output: payload }),
			),
		).toMatchObject({ ok: true, value: { payload } });
		expect(parseCodexAggregationOutput(JSON.stringify(payload))).toMatchObject({
			ok: true,
			value: { payload },
		});
	});

	it("returns aggregation-specific failures for invalid JSON and schema", () => {
		expect(parseCodexAggregationOutput("not json")).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-invalid-json" },
		});
		expect(
			parseCodexAggregationOutput(JSON.stringify({ clusters: [{ findings: [] }] })),
		).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-invalid-output" },
		});
	});
});
