import { describe, expect, test } from "vitest";

import {
	nullLandExecutionProgress,
	type LandExecutionStep,
} from "../../src/land/execution/host-seams.ts";
import { createFlowLandExecutionProgress } from "../../src/land/landing-execution.ts";
import type { LandMatrixRowSpec } from "../../src/land/land-matrix-progress.ts";
import type { LandedPullRequest, LandingPlan } from "../../src/land/types.ts";

interface StepUpdate {
	readonly branch: string;
	readonly step: LandExecutionStep;
	readonly state: string;
}

describe("land execution progress", () => {
	test("null progress accepts the complete execution progress contract", () => {
		const plan = landingPlan();
		const pullRequest: LandedPullRequest = {
			branch: "feature/a",
			number: 123,
			title: "Feature A",
		};

		expect(() => {
			nullLandExecutionProgress.note("Merging...");
			nullLandExecutionProgress.setStatus("merging...");
			nullLandExecutionProgress.setStep("feature/a", "merge", "active");
			nullLandExecutionProgress.setStep("feature/a", "restack", "skipped");
			nullLandExecutionProgress.recordMergedPullRequest(pullRequest);
			nullLandExecutionProgress.planRecalculated(plan);
		}).not.toThrow();
	});

	test("Flow adapter maps execution events to command, status, live, and matrix progress", () => {
		const notes: string[] = [];
		const statuses: Array<string | undefined> = [];
		const merged: Array<{ prNumber: number; branch: string }> = [];
		const steps: StepUpdate[] = [];
		const rowSets: Array<readonly LandMatrixRowSpec[]> = [];
		const progress = createFlowLandExecutionProgress({
			commandStream: {
				note: (message) => notes.push(message),
				emitLiveProgress: (event) => merged.push(event),
			},
			progress: {
				note: (message) => notes.push(message),
				setStatus: (message) => statuses.push(message),
			},
			matrix: {
				setRows: (rows) => rowSets.push([...rows]),
				setActiveOperations: () => undefined,
				setCell: (branch, step, update) => {
					steps.push({ branch, step, state: update.state });
				},
				setAllCells: () => undefined,
				setAllOtherCells: () => undefined,
				recordMergedPr: () => undefined,
			},
		});

		progress.note("Merging...");
		progress.setStatus("merging...");
		progress.setStep("feature/a", "gate", "active");
		progress.setStep("feature/a", "gate", "done");
		progress.setStep("feature/a", "restack", "skipped");
		progress.recordMergedPullRequest({
			branch: "feature/a",
			number: 123,
			title: "Feature A",
		});
		progress.planRecalculated(landingPlan());

		expect(notes).toEqual(["Merging..."]);
		expect(statuses).toEqual(["merging..."]);
		expect(steps).toEqual([
			{ branch: "feature/a", step: "gate", state: "active" },
			{ branch: "feature/a", step: "gate", state: "done" },
			{ branch: "feature/a", step: "restack", state: "skipped" },
		]);
		expect(merged).toEqual([{ prNumber: 123, branch: "feature/a" }]);
		expect(rowSets).toEqual([
			[
				{ branch: "feature/a", prNumber: 123, label: "feature/a (#123)" },
				{ branch: "feature/b", prNumber: 124, label: "feature/b (#124)" },
			],
		]);
	});
});

function landingPlan(): LandingPlan {
	return {
		repoRoot: "/repo",
		metadataDbPath: "/repo/.git/graphite.db",
		stack: {
			trunk: "main",
			current: "feature/b",
			actualCurrentBranch: "feature/b",
			landingTargetBranch: "feature/b",
			landingBranches: ["feature/a", "feature/b"],
			remainingLandingBranches: [],
			descendantBranches: [],
			descendantRootBranches: [],
			warnings: [],
		},
		branchPlans: [
			{ branch: "feature/a", localSha: "aaa", pr: pullRequestFacts("feature/a", 123) },
			{ branch: "feature/b", localSha: "bbb", pr: pullRequestFacts("feature/b", 124) },
		],
		preflight: {
			status: "ready",
			checkedBranches: ["feature/a", "feature/b"],
			warnings: [],
			failures: [],
		},
		prSubmitRequirements: [],
		submitRestackRequirements: [],
		managedSlotConflicts: [],
		descendantMaintenance: {
			type: "none",
			branches: [],
		},
	};
}

function pullRequestFacts(branch: string, number: number) {
	return {
		id: `PR_${number}`,
		number,
		title: branch,
		body: null,
		state: "OPEN",
		isDraft: false,
		headRefName: branch,
		baseRefName: "main",
		headRefOid: `${number}`,
		url: `https://github.com/acme/repo/pull/${number}`,
	};
}
