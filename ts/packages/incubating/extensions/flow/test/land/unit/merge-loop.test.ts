import { describe, expect, test } from "vitest";
import { nullLandExecutionProgress } from "../../../src/land/execution/host-seams.ts";
import {
	prepareMergeLoopState,
	reduceDescendantMaintenanceObservation,
	runMergeLoop,
} from "../../../src/land/execution/merge-loop.ts";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	type InMemoryLandCallEvent,
} from "../../../src/land/testing.ts";
import type {
	LandingBoundaryFailure,
	LandingPlan,
	LandingWarning,
	PullRequestFacts,
} from "../../../src/land/types.ts";

const REPO_ROOT = "/repo";
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_D = "dddddddddddddddddddddddddddddddddddddddd";

const WARNING: LandingWarning = {
	level: "warning",
	message: "Pre-existing warning.",
};

function boundaryFailure(message: string): LandingBoundaryFailure {
	return {
		type: "boundary",
		phase: "merge",
		source: "github",
		code: "test_failure",
		message,
	};
}

function pr(
	branch: string,
	number: number,
	sha: string,
	overrides: Partial<PullRequestFacts> = {},
) {
	return pullRequestFacts({
		number,
		headRefName: branch,
		headRefOid: sha,
		baseRefName: "main",
		title: `Land ${branch}`,
		...overrides,
	});
}

function plan(options: {
	landingBranches: readonly string[];
	descendantBranches?: readonly string[];
	descendantMaintenance?: LandingPlan["descendantMaintenance"];
}): LandingPlan {
	const descendantBranches = options.descendantBranches ?? [];
	return {
		repoRoot: REPO_ROOT,
		metadataDbPath: `${REPO_ROOT}/.git/graphite.db`,
		stack: {
			trunk: "main",
			current: options.landingBranches.at(-1) ?? "",
			actualCurrentBranch: options.landingBranches.at(-1) ?? "",
			landingTargetBranch: options.landingBranches.at(-1) ?? "",
			landingBranches: [...options.landingBranches],
			remainingLandingBranches: [],
			descendantBranches: [...descendantBranches],
			descendantRootBranches: [...descendantBranches],
			warnings: [],
		},
		branchPlans: [],
		preflight: {
			status: "ready",
			checkedBranches: [...options.landingBranches],
			warnings: [],
			failures: [],
		},
		prSubmitRequirements: [],
		submitRestackRequirements: [],
		managedSlotConflicts: [],
		descendantMaintenance: options.descendantMaintenance ?? { type: "none", branches: [] },
	};
}

function eventLabel(event: InMemoryLandCallEvent): string {
	switch (event.operation) {
		case "git.snapshotBackupRefs":
			return `${event.operation}:${event.request.branches.join(",")}`;
		case "git.localBranchSha":
		case "graphite.refreshBranchFromRemote":
		case "graphite.deleteLocalBranch":
		case "graphite.restack":
		case "graphite.submitUpdate":
		case "graphite.branchChildren":
			return `${event.operation}:${event.request.branch}`;
		case "github.pullRequestFacts":
			return `${event.operation}:${event.request.branchOrNumber}`;
		case "github.squashMergePullRequest":
			return `${event.operation}:${event.request.pullRequest.headRefName}`;
	}
}

describe("merge loop preparation", () => {
	test("snapshots backup refs and initializes mutable state", async () => {
		const memory = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: SHA_A }] },
		});

		const result = await prepareMergeLoopState({
			context: memory.context,
			repoRoot: REPO_ROOT,
			branches: ["feature-a"],
			warnings: [WARNING],
		});

		expect(result).toEqual({
			type: "success",
			value: {
				expectedShas: new Map([["feature-a", SHA_A]]),
				deletedBranches: new Set(),
				warnings: [WARNING],
				cleanup: { retainedLocalBranches: [] },
			},
		});
		expect(memory.git.snapshotBackupRefsCalls).toEqual([
			{ repoRoot: REPO_ROOT, branches: ["feature-a"] },
		]);
	});
});

describe("descendant maintenance observation reduction", () => {
	test("later defined observation wins", () => {
		expect(
			reduceDescendantMaintenanceObservation(
				{ type: "skipped", reason: "earlier" },
				{ type: "completed" },
			),
		).toEqual({ type: "completed" });
	});

	test("later absent observation preserves the previous observation", () => {
		const previous = { type: "completed" } as const;
		expect(reduceDescendantMaintenanceObservation(previous, undefined)).toBe(previous);
	});
});

describe("merge loop over LandContext", () => {
	test("lands multiple branches in exact semantic call order and snapshots once", async () => {
		const memory = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: SHA_A },
					{ name: "feature-b", sha: SHA_B },
				],
			},
			github: { pullRequests: [pr("feature-a", 1, SHA_A), pr("feature-b", 2, SHA_B)] },
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({ landingBranches: ["feature-a", "feature-b"] }),
			warnings: [WARNING],
		});

		expect(result).toMatchObject({
			type: "success",
			observations: {
				landed: [
					{ branch: "feature-a", number: 1, title: "Land feature-a" },
					{ branch: "feature-b", number: 2, title: "Land feature-b" },
				],
				warnings: [WARNING],
				cleanup: { retainedLocalBranches: [] },
			},
		});
		expect(memory.callEvents.map(eventLabel)).toEqual([
			"git.snapshotBackupRefs:feature-a,feature-b",
			"git.localBranchSha:feature-a",
			"github.pullRequestFacts:feature-a",
			"github.squashMergePullRequest:feature-a",
			"github.pullRequestFacts:1",
			"git.localBranchSha:feature-b",
			"graphite.refreshBranchFromRemote:feature-b",
			"graphite.branchChildren:feature-a",
			"graphite.deleteLocalBranch:feature-a",
			"graphite.restack:feature-b",
			"git.localBranchSha:feature-b",
			"github.pullRequestFacts:feature-b",
			"git.localBranchSha:feature-b",
			"github.pullRequestFacts:feature-b",
			"github.squashMergePullRequest:feature-b",
			"github.pullRequestFacts:2",
			"graphite.branchChildren:feature-b",
			"graphite.deleteLocalBranch:feature-b",
		]);
		expect(memory.git.snapshotBackupRefsCalls).toHaveLength(1);
		const firstEventRead = memory.callEvents;
		expect(memory.callEvents).not.toBe(firstEventRead);
		expect(memory.callEvents[0]).not.toBe(firstEventRead[0]);
	});

	test("snapshot failure causes no merge", async () => {
		const memory = createInMemoryLandContext({
			git: {
				localBranches: [{ name: "feature-a", sha: SHA_A }],
				snapshotBackupRefsFailure: boundaryFailure("snapshot failed"),
			},
			github: { pullRequests: [pr("feature-a", 1, SHA_A)] },
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({ landingBranches: ["feature-a"] }),
			warnings: [],
		});

		expect(result).toEqual({
			type: "failure",
			observations: {
				landed: [],
				warnings: [],
				cleanup: { retainedLocalBranches: [] },
				deletedLocalBranches: [],
				descendantMaintenance: { type: "not-attempted" },
			},
			failure: boundaryFailure("snapshot failed"),
		});
		expect(memory.callEvents.map(eventLabel)).toEqual(["git.snapshotBackupRefs:feature-a"]);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("strict gate failure at branch k preserves earlier landed branches and stops", async () => {
		const memory = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: SHA_A },
					{ name: "feature-b", sha: SHA_B },
				],
			},
			github: {
				pullRequests: [pr("feature-a", 1, SHA_A), pr("feature-b", 2, SHA_B, { isDraft: true })],
			},
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({ landingBranches: ["feature-a", "feature-b"] }),
			warnings: [WARNING],
		});

		expect(result).toMatchObject({
			type: "failure",
			observations: {
				landed: [{ branch: "feature-a", number: 1 }],
				warnings: [WARNING],
				cleanup: { retainedLocalBranches: [] },
				deletedLocalBranches: ["feature-a"],
				descendantMaintenance: { type: "not-attempted" },
			},
			failure: { failedBranch: "feature-b", failedPrNumber: 2 },
		});
		expect(
			memory.github.squashMergePullRequestCalls.map((call) => call.pullRequest.number),
		).toEqual([1]);
	});

	test("squash rejection mid-loop reports failed branch and PR", async () => {
		const memory = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: SHA_A },
					{ name: "feature-b", sha: SHA_B },
				],
			},
			github: {
				pullRequests: [pr("feature-a", 1, SHA_A), pr("feature-b", 2, SHA_B)],
				squashMergeResults: { "2": { type: "failure", failure: boundaryFailure("rejected") } },
			},
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({ landingBranches: ["feature-a", "feature-b"] }),
			warnings: [],
		});

		expect(result).toMatchObject({
			type: "failure",
			observations: { landed: [{ branch: "feature-a", number: 1 }] },
			failure: {
				type: "execution",
				message: "Merge rejected; stopping stack landing immediately.",
				failedBranch: "feature-b",
				failedPrNumber: 2,
			},
		});
	});

	test("fails when post-merge verification is not MERGED", async () => {
		const openAfterMerge = pr("feature-a", 1, SHA_A, { state: "OPEN", mergedAt: null });
		const memory = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: SHA_A }] },
			github: {
				pullRequests: [pr("feature-a", 1, SHA_A)],
				postMergeFacts: { "1": openAfterMerge },
			},
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({ landingBranches: ["feature-a"] }),
			warnings: [],
		});

		expect(result).toMatchObject({
			type: "failure",
			observations: { landed: [] },
			failure: {
				message:
					"gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.",
			},
		});
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("fails when post-merge verification cannot load facts", async () => {
		const memory = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: SHA_A }] },
			github: {
				pullRequests: [pr("feature-a", 1, SHA_A)],
				postMergeFacts: {
					"1": { type: "failure", failure: boundaryFailure("verification unavailable") },
				},
			},
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({ landingBranches: ["feature-a"] }),
			warnings: [],
		});

		expect(result).toMatchObject({
			type: "failure",
			observations: { landed: [] },
			failure: { message: expect.stringContaining("verification unavailable") },
		});
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("optional maintenance skip continues with a warning", async () => {
		const memory = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: SHA_A },
					{ name: "descendant", sha: SHA_D },
				],
			},
			github: { pullRequests: [pr("feature-a", 1, SHA_A)] },
			graphite: {
				refreshBranchFromRemoteResults: {
					descendant: {
						type: "failure",
						commandDisplay: "semantic display only",
						result: { type: "exited", stdout: "", stderr: "failed", code: 1, signal: null },
					},
				},
			},
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({
				landingBranches: ["feature-a"],
				descendantBranches: ["descendant"],
				descendantMaintenance: {
					type: "auto",
					branches: ["descendant"],
					targetBranches: ["descendant"],
				},
			}),
			warnings: [],
		});

		expect(result).toMatchObject({
			type: "success",
			observations: {
				landed: [{ branch: "feature-a", number: 1 }],
				warnings: [{ level: "warning" }],
			},
		});
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("required maintenance halt stops after the landed branch", async () => {
		const memory = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: SHA_A },
					{ name: "feature-b", sha: SHA_B },
				],
			},
			github: { pullRequests: [pr("feature-a", 1, SHA_A), pr("feature-b", 2, SHA_B)] },
			graphite: {
				refreshBranchFromRemoteResults: {
					"feature-b": {
						type: "failure",
						commandDisplay: "semantic display only",
						result: { type: "exited", stdout: "", stderr: "failed", code: 1, signal: null },
					},
				},
			},
		});

		const result = await runMergeLoop({
			context: memory.context,
			progress: nullLandExecutionProgress,
			plan: plan({ landingBranches: ["feature-a", "feature-b"] }),
			warnings: [],
		});

		expect(result).toMatchObject({
			type: "failure",
			observations: { landed: [{ branch: "feature-a", number: 1 }] },
			failure: { failedBranch: "feature-b" },
		});
		expect(
			memory.github.squashMergePullRequestCalls.map((call) => call.pullRequest.number),
		).toEqual([1]);
	});
});
