import { describe, expect, it } from "vitest";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { createReviewsRuntime } from "../../src/core/context.ts";
import type {
	ReviewAggregationProposalCluster,
	ReviewAggregationProposalRequest,
	ReviewRosterRunResult,
	SourceAttributedFinding,
} from "../../src/core/models.ts";
import { FakeReviewAggregationRunnerGateway } from "../../src/gateways/review-aggregation-runner.ts";
import {
	proposeReviewAggregation,
	resolveReviewAggregation,
} from "../../src/operations/review-aggregation.ts";
import { fakeReviewsContext } from "../support/fake-reviews-context.ts";

const first: SourceAttributedFinding = {
	reviewKey: "correctness",
	occurrence: 0,
	path: "src/a.ts",
	line: 10,
	severity: "error",
	summary: "Missing guard",
	details: "The input is used before validation.",
};
const duplicate: SourceAttributedFinding = { ...first, occurrence: 1 };
const other: SourceAttributedFinding = {
	reviewKey: "design",
	occurrence: 0,
	path: "src/b.ts",
	line: 20,
	severity: "warning",
	summary: "Conflicting recommendation",
	details: "Keep this behavior for compatibility.",
};

function roster(
	findings: readonly SourceAttributedFinding[] = [first, duplicate, other],
): ReviewRosterRunResult {
	return {
		revisionRange: "main...HEAD",
		ranAt: "2026-07-16T12:00:00.000Z",
		entries: [
			{
				reviewKey: "correctness",
				position: 0,
				state: "completed",
				modelProfile: "deep",
				model: "openai/gpt-5.6-terra",
				findings: findings.filter((finding) => finding.reviewKey === "correctness"),
				usage: null,
				inputCoverage: null,
			},
			{
				reviewKey: "design",
				position: 1,
				state: "completed",
				modelProfile: "deep",
				model: "openai/gpt-5.6-terra",
				findings: findings.filter((finding) => finding.reviewKey === "design"),
				usage: null,
				inputCoverage: null,
			},
		],
		findings: [...findings],
	};
}

function proposal(clusters: readonly ReviewAggregationProposalCluster[]) {
	return { ok: true as const, value: { payload: { clusters: [...clusters] }, usage: null } };
}

function baseRequest(): ReviewAggregationProposalRequest {
	return {
		rosterResult: roster(),
		constraints: { mustGroup: [], mustSeparate: [] },
	};
}

function runtime(runner: FakeReviewAggregationRunnerGateway) {
	return createReviewsRuntime(
		fakeReviewsContext({
			reviewAggregationRunner: runner,
			gitGateway: new InMemoryGitGateway({
				repoRoot: process.cwd().replace(/\/ts$/, ""),
				optionalRepoRoot: process.cwd().replace(/\/ts$/, ""),
				currentBranch: "feature",
				trunkBranch: "main",
				originUrl: "git@example.com:repo.git\n",
				headCommit: "abc123",
				existingBranches: ["feature", "main"],
			}),
		}),
	);
}

describe("proposeReviewAggregation", () => {
	it("calls the model once, preserves occurrences, normalizes order, and derives accounting", async () => {
		const runner = new FakeReviewAggregationRunnerGateway(
			proposal([
				{
					findings: [other],
					recommendationConflict: true,
					conflictExplanation: "The recommendations cannot both be followed.",
					disposition: "defer",
				},
				{
					findings: [duplicate, first],
					recommendationConflict: false,
					conflictExplanation: null,
					disposition: "fix",
				},
			]),
		);
		const result = await proposeReviewAggregation(runtime(runner), baseRequest());

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(runner.calls()).toHaveLength(1);
		expect(runner.calls()[0]?.request.rosterResult.findings).toEqual([first, duplicate, other]);
		expect(result.value.clusters.map((cluster) => cluster.findings)).toEqual([
			[first, duplicate],
			[other],
		]);
		expect(result.value.findingDispositions).toEqual([
			{ finding: first, disposition: "fix", authority: "model-proposed" },
			{ finding: duplicate, disposition: "fix", authority: "model-proposed" },
			{ finding: other, disposition: "defer", authority: "model-proposed" },
		]);
		expect(result.value.completeness).toBe("all-proposed");
	});

	it.each([
		["missing", [[first], [other]]],
		[
			"duplicated",
			[
				[first, duplicate],
				[duplicate, other],
			],
		],
		["altered", [[{ ...first, summary: "Changed" }, duplicate], [other]]],
	])("rejects %s proposal accounting", async (_name, members) => {
		const clusters = members.map((findings) => ({
			findings,
			recommendationConflict: false as const,
			conflictExplanation: null,
			disposition: "fix" as const,
		}));
		const runner = new FakeReviewAggregationRunnerGateway(proposal(clusters));
		const result = await proposeReviewAggregation(runtime(runner), baseRequest());
		expect(result).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-invalid-accounting" },
		});
	});

	it("rejects contradictory constraints before model invocation", async () => {
		const runner = new FakeReviewAggregationRunnerGateway();
		const request = baseRequest();
		request.constraints.mustGroup.push([first, duplicate]);
		request.constraints.mustSeparate.push([first, duplicate]);
		const result = await proposeReviewAggregation(runtime(runner), request);
		expect(result).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-invalid-constraints" },
		});
		expect(runner.calls()).toHaveLength(0);
	});

	it("enforces constraints after model output", async () => {
		const runner = new FakeReviewAggregationRunnerGateway(
			proposal([
				{
					findings: [first],
					recommendationConflict: false,
					conflictExplanation: null,
					disposition: "fix",
				},
				{
					findings: [duplicate, other],
					recommendationConflict: false,
					conflictExplanation: null,
					disposition: "fix",
				},
			]),
		);
		const request = baseRequest();
		request.constraints.mustGroup.push([first, duplicate]);
		const result = await proposeReviewAggregation(runtime(runner), request);
		expect(result).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-invalid-constraints" },
		});
	});

	it("bulk-confirms only unconflicted clusters and applies explicit conflict overrides", async () => {
		const runner = new FakeReviewAggregationRunnerGateway(
			proposal([
				{
					findings: [first, duplicate],
					recommendationConflict: false,
					conflictExplanation: null,
					disposition: "fix",
				},
				{
					findings: [other],
					recommendationConflict: true,
					conflictExplanation: "Incompatible recommendations.",
					disposition: "defer",
				},
			]),
		);
		const proposed = await proposeReviewAggregation(runtime(runner), baseRequest());
		expect(proposed.ok).toBe(true);
		if (!proposed.ok) return;
		const result = resolveReviewAggregation({
			proposalResult: proposed.value,
			decisions: {
				bulkConfirmUnconflicted: true,
				clusters: [
					{
						findings: [other],
						recommendationConflict: false,
						conflictExplanation: null,
						disposition: "reject",
					},
				],
			},
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(
			result.value.clusters.map(({ disposition, authority }) => ({ disposition, authority })),
		).toEqual([
			{ disposition: "fix", authority: "engineer-confirmed" },
			{ disposition: "reject", authority: "engineer-confirmed" },
		]);
		expect(result.value.completeness).toBe("fully-confirmed");
	});

	it("rejects decisions that do not match a complete cluster in the exact proposal", async () => {
		const proposed = await proposeReviewAggregation(
			runtime(
				new FakeReviewAggregationRunnerGateway(
					proposal([
						{
							findings: [first, duplicate],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "fix",
						},
						{
							findings: [other],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "defer",
						},
					]),
				),
			),
			baseRequest(),
		);
		expect(proposed.ok).toBe(true);
		if (!proposed.ok) return;
		const result = resolveReviewAggregation({
			proposalResult: proposed.value,
			decisions: {
				bulkConfirmUnconflicted: false,
				clusters: [
					{
						findings: [first],
						recommendationConflict: true,
						conflictExplanation: "Engineer found a conflict.",
						disposition: "defer",
					},
				],
			},
		});
		expect(result).toMatchObject({
			ok: false,
			error: { code: "review-aggregation-invalid-request" },
		});
	});

	it("rejects unknown, repeated, and duplicate decision memberships", async () => {
		const proposed = await proposeReviewAggregation(
			runtime(
				new FakeReviewAggregationRunnerGateway(
					proposal([
						{
							findings: [first, duplicate],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "fix",
						},
						{
							findings: [other],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "defer",
						},
					]),
				),
			),
			baseRequest(),
		);
		expect(proposed.ok).toBe(true);
		if (!proposed.ok) return;
		const decision = {
			recommendationConflict: false as const,
			conflictExplanation: null,
			disposition: "fix" as const,
		};
		for (const clusters of [
			[{ ...decision, findings: [{ ...first, summary: "Unknown" }] }],
			[{ ...decision, findings: [first, first] }],
			[
				{ ...decision, findings: [first, duplicate] },
				{ ...decision, findings: [duplicate, first] },
			],
		]) {
			expect(
				resolveReviewAggregation({
					proposalResult: proposed.value,
					decisions: { bulkConfirmUnconflicted: false, clusters },
				}),
			).toMatchObject({
				ok: false,
				error: { code: "review-aggregation-invalid-request" },
			});
		}
	});

	it("carries confirmed state for exact membership and resets split or merged membership", async () => {
		const initial = await proposeReviewAggregation(
			runtime(
				new FakeReviewAggregationRunnerGateway(
					proposal([
						{
							findings: [first, duplicate],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "fix",
						},
						{
							findings: [other],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "fix",
						},
					]),
				),
			),
			baseRequest(),
		);
		expect(initial.ok).toBe(true);
		if (!initial.ok) return;
		const confirmed = resolveReviewAggregation({
			proposalResult: initial.value,
			decisions: {
				bulkConfirmUnconflicted: false,
				clusters: [
					{
						findings: [duplicate, first],
						recommendationConflict: true,
						conflictExplanation: "Engineer-confirmed conflict.",
						disposition: "fix-manually",
					},
				],
			},
		});
		expect(confirmed.ok).toBe(true);
		if (!confirmed.ok) return;
		const corrected = await proposeReviewAggregation(
			runtime(
				new FakeReviewAggregationRunnerGateway(
					proposal([
						{
							findings: [first, duplicate],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "reject",
						},
						{
							findings: [other],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "defer",
						},
					]),
				),
			),
			{ ...baseRequest(), priorResult: confirmed.value },
		);
		expect(corrected.ok).toBe(true);
		if (!corrected.ok) return;
		expect(corrected.value.clusters[0]).toMatchObject({
			recommendationConflict: true,
			conflictExplanation: "Engineer-confirmed conflict.",
			disposition: "fix-manually",
			authority: "engineer-confirmed",
		});

		const split = await proposeReviewAggregation(
			runtime(
				new FakeReviewAggregationRunnerGateway(
					proposal([
						{
							findings: [first],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "reject",
						},
						{
							findings: [duplicate],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "defer",
						},
						{
							findings: [other],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "fix",
						},
					]),
				),
			),
			{ ...baseRequest(), priorResult: confirmed.value },
		);
		expect(split).toMatchObject({
			ok: true,
			value: {
				clusters: [
					{ disposition: "reject", authority: "model-proposed" },
					{ disposition: "defer", authority: "model-proposed" },
					{ disposition: "fix", authority: "model-proposed" },
				],
			},
		});

		const regrouped = await proposeReviewAggregation(
			runtime(
				new FakeReviewAggregationRunnerGateway(
					proposal([
						{
							findings: [first, duplicate, other],
							recommendationConflict: false,
							conflictExplanation: null,
							disposition: "reject",
						},
					]),
				),
			),
			{ ...baseRequest(), priorResult: confirmed.value },
		);
		expect(regrouped).toMatchObject({
			ok: true,
			value: {
				clusters: [{ disposition: "reject", authority: "model-proposed" }],
			},
		});
	});

	it("passes prior state and correction constraints to the one model call", async () => {
		const initialRunner = new FakeReviewAggregationRunnerGateway(
			proposal([
				{
					findings: [first, duplicate, other],
					recommendationConflict: false,
					conflictExplanation: null,
					disposition: "fix-manually",
				},
			]),
		);
		const initial = await proposeReviewAggregation(runtime(initialRunner), baseRequest());
		expect(initial.ok).toBe(true);
		if (!initial.ok) return;
		const correctionRunner = new FakeReviewAggregationRunnerGateway(
			proposal([
				{
					findings: [first, duplicate],
					recommendationConflict: false,
					conflictExplanation: null,
					disposition: "fix",
				},
				{
					findings: [other],
					recommendationConflict: false,
					conflictExplanation: null,
					disposition: "reject",
				},
			]),
		);
		const correction = baseRequest();
		correction.priorResult = initial.value;
		correction.constraints.mustSeparate.push([first, other]);
		const result = await proposeReviewAggregation(runtime(correctionRunner), correction);
		expect(result.ok).toBe(true);
		expect(correctionRunner.calls()[0]?.request.priorResult).toEqual(initial.value);
		expect(correctionRunner.calls()[0]?.request.constraints).toEqual(correction.constraints);
	});
});
