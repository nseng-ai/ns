import { describe, expect, test } from "vitest";

import { planPostTargetActions } from "../../src/land/execution/post-target-actions.ts";
import { createLandingPlan } from "./land-maintenance-test-support.ts";

describe("post-target action planning", () => {
	test("bounds reconciliation to the selected-path survivors", () => {
		const plan = createLandingPlan({
			landingBranches: ["feature-a"],
			remainingLandingBranches: ["feature-b", "feature-c"],
			descendantBranches: ["feature-b", "feature-c", "feature-d"],
			descendantMaintenance: {
				type: "auto",
				branches: ["feature-b", "feature-c", "feature-d"],
				targetBranches: ["feature-b"],
			},
		});

		expect(planPostTargetActions(plan)).toEqual({
			type: "reconcile",
			roots: ["feature-b"],
			branches: ["feature-b", "feature-c"],
		});
	});

	test("plans disclosed descendant roots after the selected path is complete", () => {
		const plan = createLandingPlan({
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c", "feature-d"],
			descendantMaintenance: {
				type: "auto",
				branches: ["feature-c", "feature-d"],
				targetBranches: ["feature-c", "feature-d"],
			},
		});

		expect(planPostTargetActions(plan)).toEqual({
			type: "reconcile",
			roots: ["feature-c", "feature-d"],
			branches: ["feature-c", "feature-d"],
		});
	});

	test("preserves blocked descendant disclosure instead of planning mutation", () => {
		const plan = createLandingPlan({
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c"],
			descendantMaintenance: {
				type: "blocked",
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
				reason: "descendant branches are checked out elsewhere",
				conflicts: [
					{
						type: "manual-worktree",
						branch: "feature-c",
						path: "/tmp/feature-c",
					},
				],
			},
		});

		expect(planPostTargetActions(plan)).toEqual({
			type: "blocked",
			branches: ["feature-c"],
		});
	});
});
