import { describe, expect, it } from "vitest";

import {
	buildReviewAggregationJsonSchema,
	reviewAggregationResponseFromPayload,
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

	it("validates unknown payloads into aggregation execution responses", () => {
		expect(
			reviewAggregationResponseFromPayload({ payload, usage: null, harnessLabel: "Claude Code" }),
		).toMatchObject({ ok: true, value: { payload, usage: null } });
	});

	it("returns aggregation-specific failures for payloads that miss the schema", () => {
		const result = reviewAggregationResponseFromPayload({
			payload: { clusters: [{ findings: [] }] },
			usage: null,
			harnessLabel: "Codex",
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-invalid-output" },
		});
		if (!result.ok) expect(result.error.message).toContain("Codex");
	});
});
