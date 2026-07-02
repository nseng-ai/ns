import { landStackFailure, type LandStackFailure } from "./errors.ts";
import type { LandingFailure } from "../land/api.ts";
import type { LandingPlan, RestackRequirement } from "./types.ts";

export type LandingFailureSource = "git" | "graphite" | "github" | "worktree" | "slot";

interface LandPlanForFlow {
	readonly repoRoot: string;
	readonly metadataDbPath: string;
	readonly stack: {
		readonly trunk: string;
		readonly current: string;
		readonly actualCurrentBranch: string;
		readonly landingTargetBranch: string;
		readonly landingBranches: readonly string[];
		readonly remainingLandingBranches: readonly string[];
		readonly descendantBranches: readonly string[];
		readonly warnings: readonly { readonly message: string }[];
	};
	readonly branchPlans: readonly {
		readonly branch: string;
		readonly localSha: string;
		readonly pr: {
			readonly number: number;
			readonly title: string;
			readonly body: string | null;
			readonly state: string;
			readonly isDraft: boolean;
			readonly headRefName: string;
			readonly baseRefName: string;
			readonly headRefOid: string;
			readonly mergeStateStatus?: string;
			readonly url?: string;
			readonly mergedAt?: string | null;
		};
	}[];
	readonly prSubmitRequirements: readonly {
		readonly branch: string;
		readonly prNumber: number;
		readonly localSha: string;
		readonly prHeadSha: string;
		readonly baseRefName: string;
		readonly expectedBaseRefName?: string;
		readonly reasons: readonly string[];
	}[];
	readonly submitRestackRequirements: readonly RestackRequirement[];
	readonly managedSlotConflicts: readonly {
		readonly type: "current" | "managed-slot" | "manual-worktree";
		readonly branch: string;
		readonly path: string;
	}[];
	readonly descendantMaintenance:
		| { readonly type: "none"; readonly branches: readonly [] }
		| { readonly type: "auto"; readonly branches: readonly string[]; readonly targetBranch: string }
		| {
				readonly type: "skipped";
				readonly branches: readonly string[];
				readonly targetBranch?: string;
				readonly conflicts: readonly {
					readonly type: "current" | "managed-slot" | "manual-worktree";
					readonly branch: string;
					readonly path: string;
				}[];
				readonly reason: string;
		  };
}

export function toFlowLandingPlan(plan: LandPlanForFlow): LandingPlan {
	return {
		repoRoot: plan.repoRoot,
		metadataDbPath: plan.metadataDbPath,
		stack: {
			trunk: plan.stack.trunk,
			current: plan.stack.current,
			actualCurrentBranch: plan.stack.actualCurrentBranch,
			landingTargetBranch: plan.stack.landingTargetBranch,
			landingBranches: [...plan.stack.landingBranches],
			remainingLandingBranches: [...plan.stack.remainingLandingBranches],
			descendantBranches: [...plan.stack.descendantBranches],
			warnings: plan.stack.warnings.map((warning) => warning.message),
		},
		branchPlans: plan.branchPlans.map((branchPlan) => ({
			branch: branchPlan.branch,
			localSha: branchPlan.localSha,
			pr: {
				number: branchPlan.pr.number,
				title: branchPlan.pr.title,
				body: branchPlan.pr.body,
				state: branchPlan.pr.state,
				isDraft: branchPlan.pr.isDraft,
				headRefName: branchPlan.pr.headRefName,
				baseRefName: branchPlan.pr.baseRefName,
				headRefOid: branchPlan.pr.headRefOid,
				...(branchPlan.pr.mergeStateStatus === undefined
					? {}
					: { mergeStateStatus: branchPlan.pr.mergeStateStatus }),
				...(branchPlan.pr.url === undefined ? {} : { url: branchPlan.pr.url }),
				...(branchPlan.pr.mergedAt === undefined ? {} : { mergedAt: branchPlan.pr.mergedAt }),
			},
		})),
		prSubmitRequirements: plan.prSubmitRequirements.map((requirement) => ({
			branch: requirement.branch,
			prNumber: requirement.prNumber,
			localSha: requirement.localSha,
			prHeadSha: requirement.prHeadSha,
			baseRefName: requirement.baseRefName,
			...(requirement.expectedBaseRefName === undefined
				? {}
				: { expectedBaseRefName: requirement.expectedBaseRefName }),
			reasons: [...requirement.reasons],
		})),
		submitRestackRequirements: plan.submitRestackRequirements.map((requirement) => ({
			branch: requirement.branch,
			parent: requirement.parent,
		})),
		managedSlotConflicts: plan.managedSlotConflicts.map(toFlowConflict),
		descendantMaintenance: toFlowDescendantMaintenance(plan.descendantMaintenance),
	};
}

function toFlowConflict(conflict: {
	readonly type: "current" | "managed-slot" | "manual-worktree";
	readonly branch: string;
	readonly path: string;
}): { branch: string; path: string; kind: "current" | "managed-slot" | "manual-worktree" } {
	return { branch: conflict.branch, path: conflict.path, kind: conflict.type };
}

function toFlowDescendantMaintenance(
	plan: LandPlanForFlow["descendantMaintenance"],
): LandingPlan["descendantMaintenance"] {
	if (plan.type === "none") return { kind: "none", branches: [] };
	if (plan.type === "auto") {
		return { kind: "auto", branches: [...plan.branches], targetBranch: plan.targetBranch };
	}
	return {
		kind: "skipped",
		branches: [...plan.branches],
		targetBranch: plan.targetBranch,
		conflicts: plan.conflicts.map(toFlowConflict),
		reason: plan.reason,
	};
}

export function toLandStackFailure(failureValue: LandingFailure): LandStackFailure {
	if (failureValue.type === "domain") {
		if (failureValue.reason === "nothing-to-land") {
			return landStackFailure(failureValue.message, { level: "info" });
		}
		if (failureValue.reason === "dirty-worktree") {
			return landStackFailure("Working tree is dirty; refusing to start stack landing.");
		}
		if (failureValue.reason === "operation-in-progress") {
			return landStackFailure(
				`${operationLabel(failureValue.message)} is in progress; refusing to start stack landing.`,
			);
		}
	}
	return landStackFailure(failureValue.message);
}

function operationLabel(message: string): string {
	if (message.includes("cherry-pick")) return "A cherry-pick";
	if (message.includes("revert")) return "A revert";
	if (message.includes("rebase")) return "A rebase";
	return "A merge";
}
