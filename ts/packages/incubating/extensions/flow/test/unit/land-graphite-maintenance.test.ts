import { describe, expect, test } from "vitest";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
} from "../../src/land/testing.ts";
import {
	performGraphiteMaintenance,
	type GraphiteMaintenanceProgress,
} from "../../src/land/execution/maintenance.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "../../src/land/graphite-operations.ts";
import type { LandingPlan } from "../../src/land/types.ts";
import {
	planGraphiteMaintenanceTargets,
	refreshTargetsAfterMaintainedBranch,
} from "../../src/land/execution/maintenance-plan.ts";
import type { MergeLoopState } from "../../src/land/execution/merge-loop.ts";

const REPO_ROOT = "/repo";
const METADATA_DB_PATH = `${REPO_ROOT}/.git/.graphite_metadata.db`;
const FEATURE_A_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FEATURE_B_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FEATURE_C_SHA = "cccccccccccccccccccccccccccccccccccccccc";
const TRUNK_SHA = "0000000000000000000000000000000000000000";

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

		expect(maintenance).toMatchObject({
			mode: "required-next-landing",
			cleanupFailureHandling: "fail",
			branches: ["feature-b"],
			refreshCheckedOutConflictHandling: "fail",
			deleteCheckedOutConflictHandling: "fail",
			isDescendantRoot: false,
		});
		expect(maintenance.skippedScopeText("feature-a")).toBe("local branch feature-a cleanup was");
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

		expect(maintenance).toMatchObject({
			mode: "required-descendants",
			cleanupFailureHandling: "fail",
			branches: ["feature-c"],
			refreshCheckedOutConflictHandling: "defer",
			deleteCheckedOutConflictHandling: "fail",
			isDescendantRoot: true,
		});
		expect(maintenance.skippedScopeText("feature-a")).toBe(
			"local branch feature-a cleanup and descendant restack/update were",
		);
	});

	test("plans none mode as warning-only local cleanup", () => {
		const maintenance = planGraphiteMaintenanceTargets(
			createLandingPlan({ landingBranches: ["feature-a"] }),
			0,
		);

		expect(maintenance).toMatchObject({
			mode: "none",
			cleanupFailureHandling: "warn",
			branches: [],
			deleteCheckedOutConflictHandling: "retain",
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
					{ name: "main", sha: TRUNK_SHA },
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

		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: progress.progress,
			plan,
			step: { index: 0, branch: "feature-a", prNumber: 1, state },
		});

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
					{ name: "main", sha: TRUNK_SHA },
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

		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({ landingBranches: ["feature-a", "feature-b"] }),
			step: { index: 0, branch: "feature-a", prNumber: 1, state },
		});

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
		{
			name: "halts required descendant reconciliation",
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c"],
			descendantMaintenance: {
				type: "auto" as const,
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
			},
			movedBranch: "feature-c",
			expectedKind: "halt",
		},
	] as const)("guards moved SHAs and $name", async (testCase) => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: testCase.movedBranch, sha: FEATURE_C_SHA },
				],
			},
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
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
		});

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

	test("fails checkout-conflicted descendant refresh without later mutations", async () => {
		const conflictResult = {
			type: "exited" as const,
			stdout: "",
			stderr: "fatal: 'feature-c' is already checked out at '/repo-slot'\n",
			code: 1,
			signal: null,
		};
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: {
				refreshBranchFromRemoteResults: {
					"feature-c": {
						type: "checkout-conflict",
						branch: "feature-c",
						path: "/repo-slot",
						commandDisplay: "gt get feature-c --downstack --force",
						result: conflictResult,
					},
				},
			},
		});
		const progress = createProgressRecorder();
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: progress.progress,
			plan: createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantMaintenance: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			step: {
				index: 0,
				branch: "feature-a",
				prNumber: 1,
				state: createMergeLoopState([
					["feature-a", FEATURE_A_SHA],
					["feature-c", FEATURE_C_SHA],
				]),
			},
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "descendant-maintenance",
			failure: {
				failedBranch: "feature-c",
				message: expect.stringContaining(
					"feature-c could not be refreshed because feature-c is checked out at /repo-slot; it was not mutated",
				),
			},
		});
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fakes.graphite.restackCalls).toEqual([]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("halts when a required landed branch gains unexpected children", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-b", sha: FEATURE_B_SHA },
				],
			},
			graphite: { branchChildren: { "feature-a": ["feature-b", "surprise"] } },
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
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
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			failure: { message: expect.stringContaining("unexpected Graphite children (surprise)") },
		});
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("defers the invoking branch deletion while retaining required maintenance", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
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
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
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
			deferredDeletionBranch: "feature-a",
		});

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toHaveLength(1);
		expect(fakes.graphite.restackCalls).toHaveLength(1);
		expect(fakes.graphite.submitUpdateCalls).toHaveLength(1);
	});

	test("none maintenance reports local deletion failure as a nonfatal warning", async () => {
		const fakes = createInMemoryLandContext({
			git: { localBranches: [{ name: "feature-a", sha: FEATURE_A_SHA }] },
			graphite: {
				deleteLocalBranchResults: {
					"feature-a": {
						type: "failed",
						commandDisplay: "gt delete feature-a -f -q",
						result: {
							type: "exited",
							stdout: "",
							stderr: "delete failed",
							code: 1,
							signal: null,
						},
						isLikelyInProgressGitOperation: false,
					},
				},
			},
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({ landingBranches: ["feature-a"] }),
			step: {
				index: 0,
				branch: "feature-a",
				prNumber: 1,
				state: createMergeLoopState([["feature-a", FEATURE_A_SHA]]),
			},
		});

		expect(outcome).toMatchObject({
			kind: "skip",
			warning: {
				message:
					"All target PRs were merged, but deleting the local Graphite branch feature-a failed.",
			},
		});
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
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({ landingBranches: ["feature-a"] }),
			step: { index: 0, branch: "feature-a", prNumber: 1, state },
		});

		expect(outcome).toEqual({ kind: "proceed" });
		expect(state.cleanup.retainedLocalBranches).toEqual([
			{ branch: "feature-a", path: "/repo-slot" },
		]);
	});

	test("aggregates failures across multiple descendant roots before cleanup", async () => {
		const failureResult = {
			type: "exited" as const,
			stdout: "refresh output",
			stderr: "refresh failed",
			code: 7,
			signal: null,
		};
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
					{ name: "feature-d", sha: FEATURE_B_SHA },
				],
			},
			graphite: {
				refreshBranchFromRemoteResults: {
					"feature-c": {
						type: "failure",
						commandDisplay: "gt get feature-c",
						result: failureResult,
					},
					"feature-d": {
						type: "failure",
						commandDisplay: "gt get feature-d",
						result: failureResult,
					},
				},
			},
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c", "feature-d"],
				descendantMaintenance: {
					type: "auto",
					branches: ["feature-c", "feature-d"],
					targetBranches: ["feature-c", "feature-d"],
				},
			}),
			step: {
				index: 0,
				branch: "feature-a",
				prNumber: 1,
				state: createMergeLoopState([
					["feature-a", FEATURE_A_SHA],
					["feature-c", FEATURE_C_SHA],
					["feature-d", FEATURE_B_SHA],
				]),
			},
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "descendant-maintenance",
			failure: {
				message: expect.stringContaining(
					"required descendant reconciliation failed for feature-c, feature-d",
				),
			},
		});
		expect(fakes.graphite.refreshBranchFromRemoteCalls.map((call) => call.branch)).toEqual([
			"feature-c",
			"feature-d",
		]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("PR metadata already current skips submit", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
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

		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: progress.progress,
			plan,
			step: { index: 0, branch: "feature-a", prNumber: 1, state },
		});

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
		expect(progress.notes).toContain(
			"Skipped gt submit for feature-b; PR metadata already current.",
		);
	});

	test("descendant restack command failure halts reconciliation after safe cleanup", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: {
				restackResults: {
					"upstack:feature-c": {
						type: "failure",
						commandDisplay: "gt restack custom feature-c",
						result: {
							type: "exited",
							stdout: "partial restack",
							stderr: "restack failed",
							code: 9,
							signal: null,
						},
					},
				},
			},
		});
		const progress = createProgressRecorder();
		const plan = createLandingPlan({
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c"],
			descendantMaintenance: {
				type: "auto",
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
			},
		});
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-c", FEATURE_C_SHA],
		]);

		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: progress.progress,
			plan,
			step: { index: 0, branch: "feature-a", prNumber: 1, state },
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "descendant-maintenance",
			failure: {
				message: "PR #1 merged, but restack failed for descendant root feature-c.",
				displayCommand: "gt restack custom feature-c",
				execResult: { stdout: "partial restack", stderr: "restack failed", code: 9 },
				failedBranch: "feature-c",
			},
		});
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([
			{
				repoRoot: REPO_ROOT,
				branch: "feature-c",
				checkedOutConflictHandling: "defer",
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
			{ repoRoot: REPO_ROOT, branch: "feature-c", scope: "upstack" },
		]);
		// Submit must not run when the restack step already failed.
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("zero-exit restack without refreshed-trunk ancestry fails and blocks submit", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
				branchContainsParents: { "feature-c|main": false },
			},
			graphite: { branchParents: { "feature-c": "main" } },
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantMaintenance: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			step: {
				index: 0,
				branch: "feature-a",
				prNumber: 1,
				state: createMergeLoopState([
					["feature-a", FEATURE_A_SHA],
					["feature-c", FEATURE_C_SHA],
				]),
			},
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "descendant-maintenance",
			failure: {
				failedBranch: "feature-c",
				message: expect.stringContaining(
					"gt restack exited 0, but descendant root feature-c still does not contain refreshed trunk main",
				),
			},
		});
		expect(fakes.graphite.restackCalls).toHaveLength(1);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("zero-exit restack with provider parent still on the landed branch fails and blocks submit", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: { branchParents: { "feature-c": "feature-a" } },
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantMaintenance: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			step: {
				index: 0,
				branch: "feature-a",
				prNumber: 1,
				state: createMergeLoopState([
					["feature-a", FEATURE_A_SHA],
					["feature-c", FEATURE_C_SHA],
				]),
			},
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "descendant-maintenance",
			failure: {
				failedBranch: "feature-c",
				message: expect.stringContaining(
					"provider topology still reports feature-c parented on feature-a, expected main",
				),
			},
		});
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("zero-exit submit with stale remote facts fails reconciliation", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: { branchParents: { "feature-c": "main" } },
			github: {
				// Remote facts stay stale: head on old stack history and base on the landed branch.
				pullRequests: [
					pullRequestFacts({
						number: 3,
						headRefName: "feature-c",
						baseRefName: "feature-a",
						headRefOid: FEATURE_B_SHA,
					}),
				],
			},
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantMaintenance: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			step: {
				index: 0,
				branch: "feature-a",
				prNumber: 1,
				state: createMergeLoopState([
					["feature-a", FEATURE_A_SHA],
					["feature-c", FEATURE_C_SHA],
				]),
			},
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "descendant-maintenance",
			failure: {
				failedBranch: "feature-c",
				failedPrNumber: 3,
				message: expect.stringContaining(
					"gt submit exited 0, but GitHub facts for feature-c remain stale",
				),
			},
		});
		expect(fakes.graphite.submitUpdateCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-c", force: true },
		]);
	});

	test("full success requires observed local, provider, and remote state transitions", async () => {
		const postRestackSha = "dddddddddddddddddddddddddddddddddddddddd";
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
				// Before the restack transition runs, ancestry and topology are stale.
				branchContainsParents: { "feature-c|main": false },
			},
			graphite: { branchParents: { "feature-c": "feature-a" } },
			github: {
				pullRequests: [
					pullRequestFacts({
						number: 3,
						headRefName: "feature-c",
						baseRefName: "feature-a",
						headRefOid: FEATURE_C_SHA,
					}),
				],
			},
			transitions: {
				onRestackSuccess: {
					"feature-c": {
						localSha: postRestackSha,
						containsParents: { main: true },
						providerParent: "main",
					},
				},
				onSubmitUpdateSuccess: {
					"feature-c": { headRefOid: postRestackSha, baseRefName: "main", baseRefOid: TRUNK_SHA },
				},
			},
		});
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-c", FEATURE_C_SHA],
		]);

		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantMaintenance: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			step: { index: 0, branch: "feature-a", prNumber: 1, state },
		});

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.restackCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-c", scope: "upstack" },
		]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-c", force: true },
		]);
		expect(fakes.graphite.branchParentCalls).toEqual([
			{ repoRoot: REPO_ROOT, metadataDbPath: METADATA_DB_PATH, branch: "feature-c" },
		]);
		// Post-restack SHA becomes the new expectation for the reconciled root.
		expect(state.expectedShas.get("feature-c")).toBe(postRestackSha);
	});

	test("multi-root reconcile attempts every root and aggregates failures without false completion", async () => {
		const postRestackSha = "dddddddddddddddddddddddddddddddddddddddd";
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "main", sha: TRUNK_SHA },
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
					{ name: "feature-d", sha: FEATURE_B_SHA },
				],
			},
			graphite: {
				branchParents: { "feature-c": "main", "feature-d": "main" },
				restackResults: {
					"upstack:feature-d": {
						type: "failure",
						commandDisplay: "gt restack feature-d",
						result: {
							type: "exited",
							stdout: "",
							stderr: "restack failed",
							code: 1,
							signal: null,
						},
					},
				},
			},
			github: {
				pullRequests: [
					pullRequestFacts({
						number: 3,
						headRefName: "feature-c",
						baseRefName: "feature-a",
						headRefOid: FEATURE_C_SHA,
					}),
				],
			},
			transitions: {
				onRestackSuccess: {
					"feature-c": {
						localSha: postRestackSha,
						containsParents: { main: true },
						providerParent: "main",
					},
				},
				onSubmitUpdateSuccess: {
					"feature-c": { headRefOid: postRestackSha, baseRefName: "main", baseRefOid: TRUNK_SHA },
				},
			},
		});
		const outcome = await performGraphiteMaintenance({
			landContext: fakes.context,
			progress: createProgressRecorder().progress,
			plan: createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c", "feature-d"],
				descendantMaintenance: {
					type: "auto",
					branches: ["feature-c", "feature-d"],
					targetBranches: ["feature-c", "feature-d"],
				},
			}),
			step: {
				index: 0,
				branch: "feature-a",
				prNumber: 1,
				state: createMergeLoopState([
					["feature-a", FEATURE_A_SHA],
					["feature-c", FEATURE_C_SHA],
					["feature-d", FEATURE_B_SHA],
				]),
			},
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "descendant-maintenance",
			failure: {
				failedBranch: "feature-d",
				message: expect.stringContaining("restack failed for descendant root feature-d"),
			},
		});
		// Every root was attempted: feature-c fully reconciled before feature-d's failure surfaced.
		expect(fakes.graphite.restackCalls.map((call) => call.branch)).toEqual([
			"feature-c",
			"feature-d",
		]);
		expect(fakes.graphite.submitUpdateCalls.map((call) => call.branch)).toEqual(["feature-c"]);
	});
});

function createLandingPlan(options: {
	readonly landingBranches: readonly string[];
	readonly remainingLandingBranches?: readonly string[];
	readonly descendantBranches?: readonly string[];
	readonly descendantMaintenance?: LandingPlan["descendantMaintenance"];
}): LandingPlan {
	const firstLandingBranch = options.landingBranches[0] ?? "feature-a";
	return {
		repoRoot: REPO_ROOT,
		metadataDbPath: METADATA_DB_PATH,
		stack: stackSnapshot({
			trunk: "main",
			current: firstLandingBranch,
			actualCurrentBranch: firstLandingBranch,
			landingTargetBranch: firstLandingBranch,
			landingBranches: options.landingBranches,
			remainingLandingBranches: options.remainingLandingBranches ?? [],
			descendantBranches: options.descendantBranches ?? [],
			descendantRootBranches: options.descendantBranches ?? [],
		}),
		branchPlans: [],
		preflight: {
			status: "ready",
			checkedBranches: [],
			warnings: [],
			failures: [],
		},
		prSubmitRequirements: [],
		submitRestackRequirements: [],
		managedSlotConflicts: [],
		descendantMaintenance: options.descendantMaintenance ?? { type: "none", branches: [] },
	};
}

function createMergeLoopState(entries: readonly (readonly [string, string])[]): MergeLoopState {
	return {
		expectedShas: new Map(entries),
		deletedBranches: new Set(),
		warnings: [],
		cleanup: { retainedLocalBranches: [] },
	};
}

function createProgressRecorder(): {
	readonly progress: GraphiteMaintenanceProgress;
	readonly notes: readonly string[];
	readonly statuses: readonly (string | undefined)[];
} {
	const notes: string[] = [];
	const statuses: Array<string | undefined> = [];
	return {
		progress: {
			note: (message) => notes.push(message),
			setStatus: (message) => statuses.push(message),
		},
		notes,
		statuses,
	};
}
