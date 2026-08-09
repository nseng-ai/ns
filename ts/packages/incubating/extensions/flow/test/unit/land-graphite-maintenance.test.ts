import { describe, expect, test } from "vitest";
import { createInMemoryLandContext, pullRequestFacts } from "../../src/land/testing.ts";
import { performGraphiteMaintenance } from "../../src/land/execution/maintenance.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "../../src/land/graphite-operations.ts";
import {
	planGraphiteMaintenanceTargets,
	refreshTargetsAfterMaintainedBranch,
} from "../../src/land/execution/maintenance-plan.ts";

import {
	FEATURE_A_SHA,
	FEATURE_B_SHA,
	FEATURE_C_SHA,
	REPO_ROOT,
	createLandingPlan,
	createMergeLoopState,
	createProgressRecorder,
} from "./land-maintenance-test-support.ts";

describe("Graphite maintenance planning", () => {
	test("selects required next landing before descendant reconciliation", () => {
		const plan = createLandingPlan({
			landingBranches: ["feature-a", "feature-b"],
			descendantBranches: ["feature-c"],
			descendantMaintenance: {
				type: "auto",
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
			},
		});

		const maintenance = planGraphiteMaintenanceTargets(plan, 0);

		expect(maintenance).toEqual({
			mode: "required-next-landing",
			branches: ["feature-b"],
		});
	});

	test("selects required descendant roots after final landing branch", () => {
		const plan = createLandingPlan({
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c"],
			descendantMaintenance: {
				type: "auto",
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
			},
		});

		const maintenance = planGraphiteMaintenanceTargets(plan, 0);

		expect(maintenance).toEqual({
			mode: "required-descendants",
			branches: ["feature-c"],
		});
	});

	test("refreshes downstream landing expectations after maintained branch only", () => {
		const plan = createLandingPlan({
			landingBranches: ["feature-a", "feature-b", "feature-c"],
		});

		expect(refreshTargetsAfterMaintainedBranch(plan, "feature-b")).toEqual(["feature-c"]);
		expect(refreshTargetsAfterMaintainedBranch(plan, "feature-c")).toEqual([]);
	});
});

describe("Graphite maintenance over LandContext", () => {
	test("required next-landing maintenance proceeds through in-memory fakes", async () => {
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
		const progress = createProgressRecorder();
		const plan = createLandingPlan({ landingBranches: ["feature-a", "feature-b"] });
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-b", FEATURE_B_SHA],
		]);

		const outcome = await performGraphiteMaintenance(
			{ land: fakes.context, progress: progress.progress },
			{
				plan,
				step: { index: 0, branch: "feature-a", prNumber: 1, state },
			},
		);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([
			{
				repoRoot: REPO_ROOT,
				branch: "feature-b",
				checkedOutConflictHandling: "fail",
			},
		]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([
			{
				repoRoot: REPO_ROOT,
				branch: "feature-a",
				checkedOutConflictHandling: "fail",
			},
		]);
		expect(fakes.graphite.restackCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-b", scope: "branch-only" },
		]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-b", force: true },
		]);
		expect(fakes.git.localBranchShaCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-b" },
			{ repoRoot: REPO_ROOT, branch: "feature-b" },
		]);
		expect(fakes.github.pullRequestFactsCalls).toEqual([
			{ repoRoot: REPO_ROOT, branchOrNumber: "feature-b" },
		]);
		expect(progress.notes).toEqual([
			"Refreshing stack through feature-b...",
			"Cleaning up local branch feature-a...",
		]);
		expect(progress.statuses).toEqual([
			"refreshing stack through feature-b...",
			"deleting local Graphite branch feature-a...",
			"restacking feature-b...",
			"submitting feature-b...",
		]);
	});

	test.each([
		{
			name: "typed false ignores conflict prose",
			isLikelyInProgressGitOperation: false,
			stderr: "CONFLICT (content): merge conflict in file.ts\n",
			expectedMessage: "PR #1 merged, but deleting the local Graphite branch feature-a failed.",
		},
		{
			name: "typed true selects in-progress recovery without conflict prose",
			isLikelyInProgressGitOperation: true,
			stderr: "ordinary deletion failure\n",
			expectedMessage:
				"PR #1 merged, but Graphite cleanup for local branch feature-a stopped during branch deletion with an in-progress Git operation or conflicts.",
		},
	] as const)("uses local-branch deletion classification: $name", async (testCase) => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-b", sha: FEATURE_B_SHA },
				],
			},
			graphite: {
				deleteLocalBranchResults: {
					"feature-a": {
						type: "failed",
						commandDisplay: "gt delete feature-a -f -q",
						result: {
							type: "exited",
							stdout: "",
							stderr: testCase.stderr,
							code: 1,
							signal: null,
						},
						isLikelyInProgressGitOperation: testCase.isLikelyInProgressGitOperation,
					},
				},
			},
		});
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-b", FEATURE_B_SHA],
		]);

		const outcome = await performGraphiteMaintenance(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a", "feature-b"] }),
				step: { index: 0, branch: "feature-a", prNumber: 1, state },
			},
		);

		expect(outcome.kind).toBe("halt");
		if (outcome.kind === "halt")
			expect(outcome.failure.message).toContain(testCase.expectedMessage);
	});

	test.each([
		{
			name: "halts required next-landing maintenance",
			landingBranches: ["feature-a", "feature-b"],
			descendantBranches: [] as string[],
			descendantMaintenance: { type: "none" as const, branches: [] },
			movedBranch: "feature-b",
			expectedKind: "halt",
		},
	] as const)("guards moved SHAs and $name", async (testCase) => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: testCase.movedBranch, sha: FEATURE_C_SHA },
				],
			},
		});
		const outcome = await performGraphiteMaintenance(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({
					landingBranches: testCase.landingBranches,
					descendantBranches: testCase.descendantBranches,
					descendantMaintenance: testCase.descendantMaintenance,
				}),
				step: {
					index: 0,
					branch: "feature-a",
					prNumber: 1,
					state: createMergeLoopState([
						["feature-a", FEATURE_A_SHA],
						[testCase.movedBranch, FEATURE_B_SHA],
					]),
				},
			},
		);

		expect(outcome.kind).toBe(testCase.expectedKind);
		if (outcome.kind === "proceed") throw new Error("expected moved-SHA maintenance stop");
		const diagnostic = outcome.kind === "halt" ? outcome.failure : outcome.warning;
		expect(diagnostic?.message).toContain(
			`local branch ${testCase.movedBranch} moved from bbbbbbb to ccccccc`,
		);
		expect(diagnostic?.suggestedAction).toContain(LAND_BACKUP_RECOVERY_HINT);
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("halts when a required landed branch gains unexpected children", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-b", sha: FEATURE_B_SHA },
				],
			},
			graphite: { branchChildren: { "feature-a": ["feature-b", "surprise"] } },
		});
		const outcome = await performGraphiteMaintenance(
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
			failure: { message: expect.stringContaining("unexpected Graphite children (surprise)") },
		});
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test.each([
		{
			policy: "preserve",
			shouldDeferLandedBranchDeletion: true,
			expectedDeletedBranches: [],
			expectedReparentedBranches: [],
		},
		{
			policy: "free",
			shouldDeferLandedBranchDeletion: false,
			expectedDeletedBranches: ["feature-a"],
			expectedReparentedBranches: [],
		},
	] as const)(
		"$policy keeps required next-landing maintenance while applying branch cleanup policy",
		async ({
			shouldDeferLandedBranchDeletion,
			expectedDeletedBranches,
			expectedReparentedBranches,
		}) => {
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
			const outcome = await performGraphiteMaintenance(
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
					shouldDeferLandedBranchDeletion,
				},
			);

			expect(outcome).toEqual({ kind: "proceed" });
			expect(fakes.graphite.deleteLocalBranchCalls.map((call) => call.branch)).toEqual(
				expectedDeletedBranches,
			);
			expect(fakes.graphite.refreshBranchFromRemoteCalls).toHaveLength(1);
			expect(fakes.graphite.reparentBranchCalls.map((call) => call.branch)).toEqual(
				expectedReparentedBranches,
			);
			expect(fakes.graphite.restackCalls).toHaveLength(1);
			expect(fakes.graphite.submitUpdateCalls).toHaveLength(1);
		},
	);

	test("deferred required-next maintenance does not reparent or delete before restack", async () => {
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
						baseRefName: "main",
						headRefOid: FEATURE_B_SHA,
					}),
				],
			},
		});

		const outcome = await performGraphiteMaintenance(
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
				shouldDeferLandedBranchDeletion: true,
			},
		);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.reparentBranchCalls).toEqual([]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fakes.graphite.restackCalls).toHaveLength(1);
	});

	test("reports unexpected children directly during best-effort cleanup", async () => {
		const fakes = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: FEATURE_A_SHA }] },
			graphite: { branchChildren: { "feature-a": ["surprise"] } },
		});
		const outcome = await performGraphiteMaintenance(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a"] }),
				step: {
					index: 0,
					branch: "feature-a",
					prNumber: 1,
					state: createMergeLoopState([["feature-a", FEATURE_A_SHA]]),
				},
			},
		);

		expect(outcome).toMatchObject({
			kind: "skip",
			warning: {
				message:
					"All target PRs were merged, but feature-a now has unexpected Graphite children (surprise); local branch feature-a cleanup was skipped.",
			},
		});
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("reports a child-list failure directly during best-effort cleanup", async () => {
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
		const outcome = await performGraphiteMaintenance(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a"] }),
				step: {
					index: 0,
					branch: "feature-a",
					prNumber: 1,
					state: createMergeLoopState([["feature-a", FEATURE_A_SHA]]),
				},
			},
		);

		expect(outcome).toMatchObject({
			kind: "skip",
			warning: {
				message:
					"All target PRs were merged, but the pre-delete Graphite children re-check for feature-a failed; local branch feature-a cleanup was skipped.\ncould not read Graphite metadata",
			},
		});
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("retains a checked-out local branch and records cleanup", async () => {
		const fakes = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: FEATURE_A_SHA }] },
			graphite: {
				deleteLocalBranchResults: {
					"feature-a": {
						type: "retained",
						branch: "feature-a",
						path: "/repo-slot",
					},
				},
			},
		});
		const state = createMergeLoopState([["feature-a", FEATURE_A_SHA]]);
		const outcome = await performGraphiteMaintenance(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			{
				plan: createLandingPlan({ landingBranches: ["feature-a"] }),
				step: { index: 0, branch: "feature-a", prNumber: 1, state },
			},
		);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(state.cleanup.retainedLocalBranches).toEqual([
			{ branch: "feature-a", path: "/repo-slot" },
		]);
	});

	test("PR metadata already current skips submit", async () => {
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
						baseRefName: "main",
						headRefOid: FEATURE_B_SHA,
					}),
				],
			},
		});
		const progress = createProgressRecorder();
		const plan = createLandingPlan({
			landingBranches: ["feature-a"],
			remainingLandingBranches: ["feature-b"],
		});
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-b", FEATURE_B_SHA],
		]);

		const outcome = await performGraphiteMaintenance(
			{ land: fakes.context, progress: progress.progress },
			{
				plan,
				step: { index: 0, branch: "feature-a", prNumber: 1, state },
			},
		);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
		expect(progress.notes).toContain(
			"Skipped gt submit for feature-b; PR metadata already current.",
		);
	});
});
