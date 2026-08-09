import { describe, expect, test } from "vitest";
import { createInMemoryLandContext, pullRequestFacts } from "../../src/land/testing.ts";
import {
	cleanUpLandedBranches,
	maintainBetweenLandingTargets,
} from "../../src/land/execution/maintenance.ts";
import {
	planGraphiteMaintenanceTargets,
	refreshTargetsAfterMaintainedBranch,
} from "../../src/land/execution/maintenance-plan.ts";
import {
	FEATURE_A_SHA,
	FEATURE_B_SHA,
	REPO_ROOT,
	createLandingPlan,
	createMergeLoopState,
	createProgressRecorder,
} from "./land-maintenance-test-support.ts";

describe("Graphite maintenance planning", () => {
	test("selects the next landing target before descendants", () => {
		const plan = createLandingPlan({
			landingBranches: ["feature-a", "feature-b"],
			descendantBranches: ["feature-c"],
			descendantMaintenance: {
				type: "auto",
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
			},
		});
		expect(planGraphiteMaintenanceTargets(plan, 0)).toEqual({
			mode: "required-next-landing",
			branches: ["feature-b"],
		});
	});

	test("refreshes only the next downstream landing expectation", () => {
		const plan = createLandingPlan({ landingBranches: ["feature-a", "feature-b", "feature-c"] });
		expect(refreshTargetsAfterMaintainedBranch(plan, "feature-b")).toEqual(["feature-c"]);
	});
});

describe("named landing maintenance operations", () => {
	test("between-target maintenance refreshes, restacks, and submits without reparenting or deletion", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-b", sha: FEATURE_B_SHA },
				],
			},
			github: {
				pullRequests: [
					pullRequestFacts({
						number: 2,
						headRefName: "feature-b",
						baseRefName: "feature-a",
						headRefOid: FEATURE_B_SHA,
					}),
				],
			},
		});
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-b", FEATURE_B_SHA],
		]);
		const outcome = await maintainBetweenLandingTargets(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a", "feature-b"] }),
				step: { index: 0, branch: "feature-a", prNumber: 1, state },
			},
		);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-b", checkedOutConflictHandling: "fail" },
		]);
		expect(fakes.graphite.restackCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-b", scope: "branch-only" },
		]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-b", force: true },
		]);
		expect(fakes.graphite.reparentBranchCalls).toEqual([]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("between-target maintenance guards the expected SHA before mutation", async () => {
		const movedSha = "cccccccccccccccccccccccccccccccccccccccc";
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-b", sha: movedSha },
				],
			},
		});
		const outcome = await maintainBetweenLandingTargets(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a", "feature-b"] }),
				step: {
					index: 0,
					branch: "feature-a",
					prNumber: 1,
					state: createMergeLoopState([
						["feature-a", FEATURE_A_SHA],
						["feature-b", FEATURE_B_SHA],
					]),
				},
			},
		);
		expect(outcome).toMatchObject({
			kind: "halt",
			failure: { message: expect.stringContaining("local branch feature-b moved") },
		});
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([]);
	});

	test("cleanup retains a checked-out landed branch and records the partial fact", async () => {
		const fakes = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: FEATURE_A_SHA }] },
			graphite: {
				deleteLocalBranchResults: {
					"feature-a": { type: "retained", branch: "feature-a", path: "/repo-slot" },
				},
			},
		});
		const state = createMergeLoopState([["feature-a", FEATURE_A_SHA]]);
		const outcome = await cleanUpLandedBranches(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a"] }),
				landed: [{ branch: "feature-a", number: 1, title: "feature-a" }],
				state,
			},
		);
		expect(outcome).toEqual({ kind: "proceed" });
		expect(state.cleanup.retainedLocalBranches).toEqual([
			{ branch: "feature-a", path: "/repo-slot" },
		]);
	});

	test("cleanup skips deletion when the landed branch gains an unexpected child", async () => {
		const fakes = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: FEATURE_A_SHA }] },
			graphite: { branchChildren: { "feature-a": ["surprise"] } },
		});
		const state = createMergeLoopState([["feature-a", FEATURE_A_SHA]]);
		const outcome = await cleanUpLandedBranches(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a"] }),
				landed: [{ branch: "feature-a", number: 1, title: "feature-a" }],
				state,
			},
		);
		expect(outcome).toEqual({ kind: "proceed" });
		expect(state.warnings).toEqual([
			expect.objectContaining({ message: expect.stringContaining("unexpected Graphite children") }),
		]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("cleanup skips deletion when the pre-delete child check fails", async () => {
		const fakes = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: FEATURE_A_SHA }] },
			graphite: {
				branchChildrenFailure: {
					type: "boundary",
					source: "graphite",
					phase: "merge-maintenance-cleanup",
					code: "branch_children_failed",
					message: "could not read Graphite metadata",
				},
			},
		});
		const state = createMergeLoopState([["feature-a", FEATURE_A_SHA]]);
		const outcome = await cleanUpLandedBranches(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a"] }),
				landed: [{ branch: "feature-a", number: 1, title: "feature-a" }],
				state,
			},
		);
		expect(outcome).toEqual({ kind: "proceed" });
		expect(state.warnings).toEqual([
			expect.objectContaining({
				message: expect.stringContaining("pre-delete Graphite children re-check"),
			}),
		]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});
});
