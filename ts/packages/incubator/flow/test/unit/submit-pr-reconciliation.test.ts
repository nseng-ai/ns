import { describe, expect, test } from "vitest";

import { reconcileSubmitPrInventory, type SubmitStackBranch } from "../../src/submit/index.ts";

const existingPr = { number: 10, label: "#10", url: "https://github.com/o/r/pull/10" };
const planned: readonly SubmitStackBranch[] = [
	{ kind: "existing", branch: "feature/a", parentBranch: "main", pr: existingPr },
	{ kind: "new", branch: "feature/b", parentBranch: "feature/a" },
];

function pr(number: number) {
	return { number, label: `#${number}`, url: `https://github.com/o/r/pull/${number}` };
}

describe("reconcileSubmitPrInventory", () => {
	test("keeps planned ordering and selects only pre-submit new branches", () => {
		const result = reconcileSubmitPrInventory({
			plannedBranches: planned,
			inventory: {
				dispositions: [
					{ kind: "resolved", branch: "feature/a", pr: existingPr },
					{ kind: "resolved", branch: "feature/b", pr: pr(11) },
				],
			},
		});
		expect(result).toEqual({
			kind: "success",
			prs: [
				{ branch: "feature/a", ...existingPr },
				{ branch: "feature/b", ...pr(11) },
			],
			metadataTargets: [{ branch: "feature/b", ...pr(11) }],
		});
	});

	test("aggregates unresolved branch dispositions while preserving resolved PRs", () => {
		const result = reconcileSubmitPrInventory({
			plannedBranches: [
				...planned,
				{ kind: "new", branch: "feature/c", parentBranch: "feature/b" },
			],
			inventory: {
				dispositions: [
					{ kind: "resolved", branch: "feature/a", pr: existingPr },
					{ kind: "missing", branch: "feature/b" },
					{
						kind: "query-failed",
						branch: "feature/c",
						diagnostic: { code: "gh_failed", message: "GitHub unavailable" },
					},
				],
			},
		});
		expect(result).toMatchObject({
			kind: "failure",
			dispositions: [
				{ kind: "missing", branch: "feature/b" },
				{ kind: "query-failed", branch: "feature/c" },
			],
			resolvedPrs: [{ branch: "feature/a", number: 10 }],
		});
	});

	test("fails when an existing branch changes PR identity", () => {
		const result = reconcileSubmitPrInventory({
			plannedBranches: planned.slice(0, 1),
			inventory: {
				dispositions: [{ kind: "resolved", branch: "feature/a", pr: pr(12) }],
			},
		});
		expect(result).toMatchObject({
			kind: "failure",
			dispositions: [{ kind: "existing-pr-changed", branch: "feature/a" }],
		});
	});

	test("rejects one PR identity assigned to multiple planned branches", () => {
		const result = reconcileSubmitPrInventory({
			plannedBranches: [
				{ kind: "new", branch: "feature/a", parentBranch: "main" },
				{ kind: "new", branch: "feature/b", parentBranch: "feature/a" },
			],
			inventory: {
				dispositions: [
					{ kind: "resolved", branch: "feature/a", pr: pr(11) },
					{ kind: "resolved", branch: "feature/b", pr: pr(11) },
				],
			},
		});
		expect(result).toMatchObject({
			kind: "failure",
			dispositions: [{ kind: "duplicate-pr", branch: "feature/b", otherBranch: "feature/a" }],
		});
	});
});
