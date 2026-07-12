// Shared merged-PR verification policy for landing execution paths.
//
// A merge attempt counts as verified only when GitHub reports the PR as MERGED with a merge
// timestamp against the expected trunk and expected head branch. Callers own their distinct
// failure wording and cleanup consequences; only the verification policy is shared.

import type { PullRequestFacts } from "../types.ts";

export interface MergedPullRequestExpectation {
	readonly expectedTrunk: string;
	readonly expectedHeadBranch: string;
}

export function isVerifiedMergedPullRequest(
	facts: PullRequestFacts,
	expectation: MergedPullRequestExpectation,
): boolean {
	return (
		facts.state === "MERGED" &&
		Boolean(facts.mergedAt) &&
		facts.baseRefName === expectation.expectedTrunk &&
		facts.headRefName === expectation.expectedHeadBranch
	);
}
