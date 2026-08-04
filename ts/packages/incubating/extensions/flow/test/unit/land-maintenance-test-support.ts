import type { LandExecutionProgress } from "../../src/land/execution/host-seams.ts";
import type { MergeLoopState } from "../../src/land/execution/merge-loop.ts";
import { stackSnapshot } from "../../src/land/testing.ts";
import type { LandingPlan } from "../../src/land/types.ts";

export const REPO_ROOT = "/repo";
export const METADATA_DB_PATH = `${REPO_ROOT}/.git/.graphite_metadata.db`;
export const FEATURE_A_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const FEATURE_B_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const FEATURE_C_SHA = "cccccccccccccccccccccccccccccccccccccccc";

export function createLandingPlan(options: {
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

export function createMergeLoopState(
	entries: readonly (readonly [string, string])[],
): MergeLoopState {
	return {
		expectedShas: new Map(entries),
		deletedBranches: new Set(),
		warnings: [],
		cleanup: { retainedLocalBranches: [] },
	};
}

export function createProgressRecorder(): {
	readonly progress: LandExecutionProgress;
	readonly notes: readonly string[];
	readonly statuses: readonly (string | undefined)[];
} {
	const notes: string[] = [];
	const statuses: Array<string | undefined> = [];
	return {
		progress: {
			note: (message) => notes.push(message),
			setStatus: (message) => statuses.push(message),
			setStep: () => {},
			recordMergedPullRequest: () => {},
			planRecalculated: () => {},
		},
		notes,
		statuses,
	};
}
