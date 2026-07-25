import { describe, expect, test } from "vitest";

import {
	buildStackLandingPlan,
	executeLanding,
	loadStackLandingShape,
	nullLandConfirmationGateway,
	nullLandExecutionProgress,
	type StackLandingShape,
} from "@nseng-ai/flow/land/api";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
} from "@nseng-ai/flow/land/testing";

const ROOT = "/repo";
const SHA_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_PR_OLD = "1111111111111111111111111111111111111111";

describe("@nseng-ai/flow land stack preflight planning", () => {
	test("loads stack landing shape once through the public land API", async () => {
		const { context, git, graphite } = createInMemoryLandContext({
			git: {
				repoRoot: ROOT,
				currentBranch: "feature-a",
				localBranches: [{ name: "feature-a", sha: SHA_A }],
			},
			graphite: {
				stackShape: stackSnapshot({ current: "feature-a", landingBranches: ["feature-a"] }),
			},
		});

		const shape = await loadStackLandingShape(context, "/repo/subdir");

		expect(shape).toMatchObject({
			type: "success",
			value: {
				repoRoot: ROOT,
				current: "feature-a",
				trunk: "main",
				localBranches: [{ name: "feature-a", sha: SHA_A }],
			},
		});
		expect(git.resolveRepoRootCalls).toEqual([{ cwd: "/repo/subdir" }]);
		expect(git.currentBranchCalls).toEqual([{ repoRoot: ROOT }]);
		expect(graphite.trunkCalls).toEqual([{ repoRoot: ROOT }]);
		expect(graphite.metadataDbPathCalls).toEqual([{ repoRoot: ROOT }]);
		expect(git.listLocalBranchesCalls).toEqual([{ repoRoot: ROOT }]);
		expect(graphite.stackShapeCalls).toHaveLength(1);
	});

	test("builds from a supplied stack landing shape without reloading gateway facts", async () => {
		const { context, git, graphite } = createInMemoryLandContext({
			github: {
				pullRequests: [pullRequestFacts({ headRefName: "feature-a", headRefOid: SHA_A })],
			},
		});
		const shape: StackLandingShape = {
			repoRoot: ROOT,
			current: "feature-a",
			trunk: "main",
			metadataDbPath: "/repo/.git/graphite.db",
			stack: stackSnapshot({ current: "feature-a", landingBranches: ["feature-a"] }),
			localBranches: [{ name: "feature-a", sha: SHA_A }],
		};

		const plan = await buildStackLandingPlan(context, "/ignored", { shape });

		expect(plan).toMatchObject({ type: "success", value: { repoRoot: ROOT } });
		expect(git.resolveRepoRootCalls).toEqual([]);
		expect(git.currentBranchCalls).toEqual([]);
		expect(graphite.trunkCalls).toEqual([]);
		expect(graphite.metadataDbPathCalls).toEqual([]);
		expect(git.listLocalBranchesCalls).toEqual([]);
		expect(graphite.stackShapeCalls).toEqual([]);
		expect(git.workingTreeStatusCalls).toEqual([{ repoRoot: ROOT }]);
	});

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

		const outcome = await executeLanding({
			context,
			source: { type: "discover" },
			host: {
				confirmation: nullLandConfirmationGateway,
				progress: nullLandExecutionProgress,
			},
			request: {
				cwd: "/repo/subdir",
				target: { type: "stack" },
				mode: "dry-run",
				preflight: { shouldAllowSubmitRequiredState: false },
				cleanup: "free-slot",
			},
		});

		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				repoRoot: ROOT,
				mode: "dry-run",
				phases: [
					{ type: "completed", phase: "repo-discovery" },
					{ type: "completed", phase: "stack-shape" },
					{ type: "completed", phase: "preflight" },
					{ type: "completed", phase: "dry-run" },
				],
				cleanup: {
					preMergeFreedSlots: [],
					mergeMaintenanceCleanup: { deletedLocalBranches: [], retainedLocalBranches: [] },
					postLandingSlotCleanup: { type: "not-applicable" },
				},
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
		expect(git.listLocalBranchesCalls).toEqual([{ repoRoot: ROOT }]);
		expect(git.localBranchShaCalls).toEqual([]);
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

	test("keeps the preflight operation sentence local", async () => {
		const { context } = createInMemoryLandContext({
			git: {
				workingTreeStatus: { isClean: true, inProgressOperation: "bisect" },
				localBranches: [{ name: "feature-a", sha: SHA_A }],
			},
			graphite: {
				stackShape: stackSnapshot({ current: "feature-a", landingBranches: ["feature-a"] }),
			},
		});

		const plan = await buildStackLandingPlan(context, "/repo");

		expect(plan).toMatchObject({
			type: "failure",
			failure: {
				type: "domain",
				reason: "operation-in-progress",
				phase: "preflight",
				message: "A bisect is in progress; refusing to start stack landing.",
			},
		});
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
			shouldAllowSubmitRequiredState: true,
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
