import { describe, expect, test } from "vitest";

import { buildStackLandingPlan, executeLanding } from "sdl-land/api";
import { createInMemoryLandContext, pullRequestFacts, stackSnapshot } from "sdl-land/testing";

const ROOT = "/repo";
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_PR_OLD = "1111111111111111111111111111111111111111";

describe("sdl-land stack preflight planning", () => {
	test("builds a renderer-independent dry-run outcome without merge mutations", async () => {
		const { context, git, graphite } = createInMemoryLandContext({
			git: {
				repoRoot: ROOT,
				currentBranch: "feature-b",
				localBranches: [
					{ name: "feature-a", sha: SHA_A },
					{ name: "feature-b", sha: SHA_B },
				],
			},
			graphite: {
				stackShape: stackSnapshot({
					current: "feature-b",
					actualCurrentBranch: "feature-b",
					landingTargetBranch: "feature-b",
					landingBranches: ["feature-a", "feature-b"],
				}),
			},
			github: {
				pullRequests: [
					pullRequestFacts({
						number: 1,
						headRefName: "feature-a",
						headRefOid: SHA_A,
						baseRefName: "main",
					}),
					pullRequestFacts({
						number: 2,
						headRefName: "feature-b",
						headRefOid: SHA_B,
						baseRefName: "feature-a",
					}),
				],
			},
		});

		const outcome = await executeLanding(context, {
			cwd: "/repo/subdir",
			target: { type: "stack" },
			mode: "dry-run",
			preflight: { allowSubmitRequiredState: false },
			cleanup: { shouldFreeSlot: false, shouldForceCleanup: false },
		});

		expect(outcome).toMatchObject({
			type: "success",
			value: {
				repoRoot: ROOT,
				mode: "dry-run",
				phases: [
					{ type: "completed", phase: "repo-discovery" },
					{ type: "completed", phase: "stack-shape" },
					{ type: "completed", phase: "preflight" },
					{ type: "completed", phase: "dry-run" },
				],
				plan: {
					branchPlans: [
						{ branch: "feature-a", localSha: SHA_A, pr: { number: 1 } },
						{ branch: "feature-b", localSha: SHA_B, pr: { number: 2 } },
					],
					preflight: { status: "ready", checkedBranches: ["feature-a", "feature-b"] },
					prSubmitRequirements: [],
					submitRestackRequirements: [],
				},
			},
		});
		expect(graphite.prepareSubmitUpdateCalls).toEqual([]);
		expect(graphite.prepareRestackForSubmitCalls).toEqual([]);
		expect(git.localBranchShaCalls).toEqual([
			{ repoRoot: ROOT, branch: "feature-a" },
			{ repoRoot: ROOT, branch: "feature-b" },
		]);
	});

	test("gates on clean repo before PR preflight", async () => {
		const { context, github } = createInMemoryLandContext({
			git: {
				workingTreeStatus: { isClean: false },
				localBranches: [{ name: "feature-a", sha: SHA_A }],
			},
			graphite: {
				stackShape: stackSnapshot({ current: "feature-a", landingBranches: ["feature-a"] }),
			},
			github: { pullRequests: [pullRequestFacts({ headRefName: "feature-a", headRefOid: SHA_A })] },
		});

		const plan = await buildStackLandingPlan(context, "/repo");

		expect(plan).toMatchObject({
			type: "failure",
			failure: { type: "domain", reason: "dirty-worktree", phase: "preflight" },
		});
		expect(github.pullRequestFactsCalls).toEqual([]);
	});

	test("reports submit and restack requirements when allowed", async () => {
		const { context, git } = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: SHA_A },
					{ name: "feature-b", sha: SHA_B },
				],
				branchContainsParents: {
					"feature-a|main": true,
					"feature-b|feature-a": false,
				},
			},
			graphite: {
				stackShape: stackSnapshot({
					current: "feature-b",
					landingBranches: ["feature-a", "feature-b"],
				}),
			},
			github: {
				pullRequests: [
					pullRequestFacts({
						headRefName: "feature-a",
						headRefOid: SHA_PR_OLD,
						baseRefName: "main",
					}),
					pullRequestFacts({ number: 2, headRefName: "feature-b", headRefOid: SHA_B }),
				],
			},
		});

		const plan = await buildStackLandingPlan(context, "/repo", {
			allowSubmitRequiredState: true,
		});

		expect(plan).toMatchObject({
			type: "success",
			value: {
				preflight: { status: "submit-required" },
				prSubmitRequirements: [{ branch: "feature-a", prHeadSha: SHA_PR_OLD, localSha: SHA_A }],
				submitRestackRequirements: [{ branch: "feature-b", parent: "feature-a" }],
			},
		});
		expect(git.branchContainsParentCalls).toEqual([
			{ repoRoot: ROOT, branch: "feature-a", parent: "main" },
			{ repoRoot: ROOT, branch: "feature-b", parent: "feature-a" },
		]);
	});

	test("blocks landing branches checked out in manual worktrees", async () => {
		const { context } = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: SHA_A }] },
			graphite: {
				stackShape: stackSnapshot({ current: "feature-a", landingBranches: ["feature-a"] }),
			},
			github: { pullRequests: [pullRequestFacts({ headRefName: "feature-a", headRefOid: SHA_A })] },
			worktrees: {
				worktrees: [{ path: "/manual", branch: "feature-a" }],
				classifications: { "/manual": { type: "manual-worktree" } },
			},
		});

		const plan = await buildStackLandingPlan(context, "/repo");

		expect(plan).toMatchObject({
			type: "failure",
			failure: {
				type: "domain",
				reason: "manual-worktree-conflict",
				message:
					"Branch feature-a is checked out in non-slot worktree /manual; detach it manually and rerun.",
			},
		});
	});

	test("keeps managed landing-slot conflicts in the plan and skips blocked descendant maintenance", async () => {
		const { context } = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: SHA_A }] },
			graphite: {
				stackShape: stackSnapshot({
					current: "feature-a",
					landingBranches: ["feature-a"],
					descendantBranches: ["feature-child"],
				}),
			},
			github: { pullRequests: [pullRequestFacts({ headRefName: "feature-a", headRefOid: SHA_A })] },
			worktrees: {
				worktrees: [
					{ path: "/slot-a", branch: "feature-a" },
					{ path: "/slot-child", branch: "feature-child" },
				],
				classifications: {
					"/slot-a": { type: "managed-slot", slotName: "slot-a" },
					"/slot-child": { type: "managed-slot", slotName: "slot-child" },
				},
			},
		});

		const plan = await buildStackLandingPlan(context, "/repo");

		expect(plan).toMatchObject({
			type: "success",
			value: {
				managedSlotConflicts: [
					{ type: "managed-slot", branch: "feature-a", path: "/slot-a", slotName: "slot-a" },
				],
				descendantMaintenance: {
					type: "skipped",
					branches: ["feature-child"],
					conflicts: [{ type: "managed-slot", branch: "feature-child", path: "/slot-child" }],
				},
			},
		});
	});
});
