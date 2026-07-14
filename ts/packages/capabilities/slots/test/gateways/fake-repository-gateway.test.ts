import { describe, expect, it } from "vitest";

import { FakeSlotRepositoryGateway } from "../../src/core/gateways/fakes/repository.ts";

describe("FakeSlotRepositoryGateway", () => {
	it("returns copied local-branch and uncommitted-change results", async () => {
		const branches = ["master", "feature/a"];
		const gateway = new FakeSlotRepositoryGateway({
			localBranches: branches,
			dirtyPaths: ["/repo"],
		});

		const firstBranches = await gateway.listLocalBranches();
		const secondBranches = await gateway.listLocalBranches();
		expect(firstBranches).toEqual({ type: "ok", branches });
		expect(secondBranches).toEqual(firstBranches);
		if (firstBranches.type !== "ok" || secondBranches.type !== "ok") return;
		expect(firstBranches.branches).not.toBe(branches);
		expect(secondBranches.branches).not.toBe(firstBranches.branches);
		await expect(gateway.hasUncommittedChanges("/repo")).resolves.toEqual({
			type: "ok",
			hasUncommittedChanges: true,
		});
		await expect(gateway.hasUncommittedChanges("/other")).resolves.toEqual({
			type: "ok",
			hasUncommittedChanges: false,
		});
	});

	it("returns copied configured failure results instead of throwing", async () => {
		const localBranchesFailure = { message: "refs unavailable" };
		const uncommittedChangesFailure = { message: "status unavailable" };
		const gateway = new FakeSlotRepositoryGateway({
			localBranchesFailure,
			uncommittedChangesFailure,
		});

		const branchesResult = await gateway.listLocalBranches();
		const changesResult = await gateway.hasUncommittedChanges("/repo");
		expect(branchesResult).toEqual({ type: "failure", failure: localBranchesFailure });
		expect(changesResult).toEqual({ type: "failure", failure: uncommittedChangesFailure });
		if (branchesResult.type !== "failure" || changesResult.type !== "failure") return;
		expect(branchesResult.failure).not.toBe(localBranchesFailure);
		expect(changesResult.failure).not.toBe(uncommittedChangesFailure);
	});

	it("returns copied explicit and implicit comparisons for known refs", async () => {
		const gateway = new FakeSlotRepositoryGateway({
			localBranches: ["master", "feature/a", "feature/b"],
			branchComparisons: [
				{
					parent: "master",
					branch: "feature/a",
					comparison: {
						commits: [{ sha: "abc123", subject: "Add feature" }],
						diff: {
							filesChanged: 1,
							insertions: 2,
							deletions: 1,
							files: [
								{
									path: "src/a.ts",
									additions: 2,
									deletions: 1,
									binary: false,
								},
							],
						},
					},
				},
			],
		});

		const first = await gateway.readBranchComparison({ parent: "master", branch: "feature/a" });
		const second = await gateway.readBranchComparison({ parent: "master", branch: "feature/a" });
		expect(first).toEqual({
			type: "ok",
			comparison: {
				commits: [{ sha: "abc123", subject: "Add feature" }],
				diff: {
					filesChanged: 1,
					insertions: 2,
					deletions: 1,
					files: [
						{
							path: "src/a.ts",
							additions: 2,
							deletions: 1,
							binary: false,
						},
					],
				},
			},
		});
		if (first.type !== "ok" || second.type !== "ok") return;
		expect(second.comparison).not.toBe(first.comparison);
		expect(second.comparison.commits).not.toBe(first.comparison.commits);
		expect(second.comparison.diff.files).not.toBe(first.comparison.diff.files);
		await expect(
			gateway.readBranchComparison({ parent: "feature/a", branch: "feature/b" }),
		).resolves.toEqual({
			type: "ok",
			comparison: {
				commits: [],
				diff: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
			},
		});
	});

	it.each([
		["missing parent", { parent: "missing-parent", branch: "feature/a" }, "missing-parent"],
		["missing branch", { parent: "master", branch: "missing-branch" }, "missing-branch"],
		[
			"both missing",
			{ parent: "missing-parent", branch: "missing-branch" },
			"missing-parent, missing-branch",
		],
	])("fails comparisons with %s", async (_label, options, missingRefs) => {
		const gateway = new FakeSlotRepositoryGateway({ localBranches: ["master", "feature/a"] });

		await expect(gateway.readBranchComparison(options)).resolves.toEqual({
			type: "failure",
			failure: { message: `Local branch ref(s) not found: ${missingRefs}` },
		});
	});

	it("gives an explicit comparison failure precedence for known refs", async () => {
		const gateway = new FakeSlotRepositoryGateway({
			localBranches: ["master", "feature/a"],
			branchComparisonFailures: [
				{ parent: "master", branch: "feature/a", message: "comparison unavailable" },
			],
		});

		await expect(
			gateway.readBranchComparison({ parent: "master", branch: "feature/a" }),
		).resolves.toEqual({
			type: "failure",
			failure: { message: "comparison unavailable" },
		});
		expect(gateway.operations()).toEqual([
			{ type: "read-branch-comparison", parent: "master", branch: "feature/a" },
		]);
	});
});
