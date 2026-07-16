import { describe, expect, it } from "vitest";

import { buildReviewAggregationPrompt } from "../../src/gateways/review-aggregation-prompt.ts";
import type {
	ReviewAggregationResult,
	ReviewAggregationRunnerRequest,
	ReviewRosterRunResult,
	SourceAttributedFinding,
} from "../../src/core/models.ts";

const first: SourceAttributedFinding = {
	reviewKey: "correctness",
	occurrence: 0,
	path: "src/a.ts",
	line: 1,
	severity: "error",
	summary: "Missing guard",
	details: "The input is used before validation.",
};
const second: SourceAttributedFinding = {
	reviewKey: "design",
	occurrence: 0,
	path: "src/b.ts",
	line: 20,
	severity: "warning",
	summary: "Conflicting recommendation",
	details: "Keep this behavior for compatibility.",
};

const rosterResult: ReviewRosterRunResult = {
	revisionRange: "main...HEAD",
	ranAt: "2026-07-16T12:00:00.000Z",
	entries: [
		{
			reviewKey: "correctness",
			position: 0,
			state: "completed",
			modelProfile: "deep",
			model: "openai/gpt-5.6-terra",
			findings: [first],
			usage: null,
			inputCoverage: null,
		},
		{
			reviewKey: "design",
			position: 1,
			state: "completed",
			modelProfile: "deep",
			model: "openai/gpt-5.6-terra",
			findings: [second],
			usage: null,
			inputCoverage: null,
		},
	],
	findings: [first, second],
};

const priorResult: ReviewAggregationResult = {
	rosterResult,
	modelProfile: "reviews_deep",
	model: "openai/gpt-5.6-terra",
	clusters: [
		{
			findings: [first],
			recommendationConflict: false,
			conflictExplanation: null,
			disposition: "fix",
			authority: "engineer-confirmed",
		},
		{
			findings: [second],
			recommendationConflict: true,
			conflictExplanation: "The recommendations cannot both be followed.",
			disposition: "defer",
			authority: "model-proposed",
		},
	],
	findingDispositions: [
		{ finding: first, disposition: "fix", authority: "engineer-confirmed" },
		{ finding: second, disposition: "defer", authority: "model-proposed" },
	],
	completeness: "partially-confirmed",
};

function runnerRequest(
	overrides: Partial<ReviewAggregationRunnerRequest> = {},
): ReviewAggregationRunnerRequest {
	return {
		model: "anthropic/claude-sonnet-4-6",
		rosterResult,
		constraints: { mustGroup: [], mustSeparate: [] },
		...overrides,
	};
}

describe("buildReviewAggregationPrompt", () => {
	it("sends current roster evidence once and omits priorResult on initial calls", () => {
		const parsed = JSON.parse(buildReviewAggregationPrompt(runnerRequest())) as Record<
			string,
			unknown
		>;

		expect(Object.keys(parsed).sort()).toEqual([
			"constraints",
			"findings",
			"revisionRange",
			"rosterEntries",
		]);
		expect(parsed.revisionRange).toBe("main...HEAD");
		expect(parsed.findings).toEqual([first, second]);
		expect(parsed.rosterEntries).toEqual(
			rosterResult.entries.map((entry) => {
				if (entry.state !== "completed") return entry;
				const { findings: _findings, ...metadata } = entry;
				return metadata;
			}),
		);
		expect(buildReviewAggregationPrompt(runnerRequest()).match(/"Missing guard"/g)).toHaveLength(1);
	});

	it("projects iterative prior state to complete prior clusters only", () => {
		const prompt = buildReviewAggregationPrompt(runnerRequest({ priorResult }));
		const parsed = JSON.parse(prompt) as {
			priorResult: Record<string, unknown>;
			findings: unknown;
		};

		expect(Object.keys(parsed.priorResult)).toEqual(["clusters"]);
		expect(parsed.priorResult.clusters).toEqual(priorResult.clusters);
		expect(parsed.priorResult).not.toHaveProperty("rosterResult");
		expect(parsed.priorResult).not.toHaveProperty("model");
		expect(parsed.priorResult).not.toHaveProperty("modelProfile");
		expect(parsed.priorResult).not.toHaveProperty("findingDispositions");
		expect(parsed.priorResult).not.toHaveProperty("completeness");
		// The current roster evidence appears exactly once, top-level.
		expect(parsed.findings).toEqual([first, second]);
		expect(prompt.match(/"revisionRange"/g)).toHaveLength(1);
	});

	it("retains prior cluster membership, conflict metadata, disposition, and authority", () => {
		const parsed = JSON.parse(buildReviewAggregationPrompt(runnerRequest({ priorResult }))) as {
			priorResult: { clusters: Record<string, unknown>[] };
		};

		expect(parsed.priorResult.clusters[0]).toEqual({
			findings: [first],
			recommendationConflict: false,
			conflictExplanation: null,
			disposition: "fix",
			authority: "engineer-confirmed",
		});
		expect(parsed.priorResult.clusters[1]).toMatchObject({
			recommendationConflict: true,
			conflictExplanation: "The recommendations cannot both be followed.",
			authority: "model-proposed",
		});
	});
});
