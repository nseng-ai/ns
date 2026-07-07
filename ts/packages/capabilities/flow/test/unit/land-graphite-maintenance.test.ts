import { describe, expect, test } from "vitest";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
} from "../../src/land/testing.ts";
import {
	performGraphiteMaintenance,
	type GraphiteMaintenanceProgress,
} from "../../src/land/stack/graphite-maintenance.ts";
import type { LandingPlan } from "../../src/land/types.ts";
import {
	planGraphiteMaintenanceTargets,
	refreshTargetsAfterMaintainedBranch,
} from "../../src/land/stack/graphite-maintenance-plan.ts";
import type { MergeLoopState } from "../../src/land/stack/types.ts";

const REPO_ROOT = "/repo";
const METADATA_DB_PATH = `${REPO_ROOT}/.git/.graphite_metadata.db`;
const FEATURE_A_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FEATURE_B_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FEATURE_C_SHA = "cccccccccccccccccccccccccccccccccccccccc";

describe("Graphite maintenance planning", () => {
	test("selects required next landing before optional descendants", () => {
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
			severity: "fail",
			branches: ["feature-b"],
			refreshCheckedOutConflictHandling: "fail",
			deleteCheckedOutConflictHandling: "fail",
			isOptionalDescendant: false,
			shouldHaltOnRefreshFailure: true,
		});
		expect(maintenance.skippedScopeText("feature-a")).toBe("local branch feature-a cleanup was");
	});

	test("selects optional descendant roots after final landing branch", () => {
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
			mode: "optional-descendants",
			severity: "warn",
			branches: ["feature-c"],
			refreshCheckedOutConflictHandling: "defer",
			deleteCheckedOutConflictHandling: "fail",
			isOptionalDescendant: true,
			shouldHaltOnRefreshFailure: false,
		});
		expect(maintenance.skippedScopeText("feature-a")).toBe(
			"local branch feature-a cleanup and descendant restack/update were",
		);
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

	test("optional descendant restack warnings are non-fatal", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: {
				restackResults: { "upstack:feature-c": { type: "failure" } },
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

		expect(outcome.kind).toBe("skip");
		if (outcome.kind === "skip") {
			expect(outcome.warning?.message).toBe(
				"Restack failed after merging #1; descendant branch feature-c was left for manual restack/update.",
			);
		}
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
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
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
	readonly statuses: readonly string[];
} {
	const notes: string[] = [];
	const statuses: string[] = [];
	return {
		progress: {
			note: (message) => notes.push(message),
			setStatus: (message) => statuses.push(message),
		},
		notes,
		statuses,
	};
}
