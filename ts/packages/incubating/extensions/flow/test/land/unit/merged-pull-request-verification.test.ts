import { describe, expect, test } from "vitest";

import { isVerifiedMergedPullRequest } from "../../../src/land/execution/merged-pull-request-verification.ts";
import { pullRequestFacts } from "../../../src/land/testing.ts";
import type { PullRequestFacts } from "../../../src/land/types.ts";

const EXPECTATION = { expectedTrunk: "main", expectedHeadBranch: "feature-a" } as const;

function mergedFacts(overrides: Partial<PullRequestFacts> = {}): PullRequestFacts {
	return pullRequestFacts({
		state: "MERGED",
		mergedAt: "2026-07-12T00:00:00Z",
		baseRefName: "main",
		headRefName: "feature-a",
		...overrides,
	});
}

describe("isVerifiedMergedPullRequest", () => {
	test("verifies when state, merge timestamp, base, and head all match", () => {
		expect(isVerifiedMergedPullRequest(mergedFacts(), EXPECTATION)).toBe(true);
	});

	test.each([
		{ dimension: "state is not MERGED", overrides: { state: "OPEN" as const } },
		{ dimension: "mergedAt is missing", overrides: { mergedAt: null } },
		{ dimension: "base is not the expected trunk", overrides: { baseRefName: "release" } },
		{
			dimension: "head is not the expected landing branch",
			overrides: { headRefName: "feature-b" },
		},
	])("rejects when $dimension", ({ overrides }) => {
		expect(isVerifiedMergedPullRequest(mergedFacts(overrides), EXPECTATION)).toBe(false);
	});
});
