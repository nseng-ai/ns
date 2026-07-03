import { buildStackLandingPlan } from "../api.ts";
import type { LandingFailure } from "../api.ts";
import {
	failure,
	landStackFailure,
	success,
	type LandStackFailure,
	type LandStackResult,
} from "./errors.ts";
import { createRuntimeLandContext, type LandRuntime } from "./land-runtime.ts";
import type { FlowLandingPlan, PrSubmitRequirement } from "./types.ts";

export async function buildLandingPlan(
	runtime: LandRuntime,
	cwd: string,
	options: {
		shouldAllowSubmitRequiredState?: boolean;
		landingBranchLimit?: number;
	} = {},
): Promise<LandStackResult<FlowLandingPlan>> {
	const landPlan = await buildStackLandingPlan(createRuntimeLandContext(runtime), cwd, {
		shouldAllowSubmitRequiredState: Boolean(options.shouldAllowSubmitRequiredState),
		...(options.landingBranchLimit === undefined
			? {}
			: { landingBranchLimit: options.landingBranchLimit }),
	});
	if (landPlan.type === "failure") return failure(toLandStackFailure(landPlan.failure));

	return success(toFlowLandingPlan(landPlan.value));
}

type StackLandingPlanResult = Awaited<ReturnType<typeof buildStackLandingPlan>>;
type StackLandingPlan = Extract<StackLandingPlanResult, { readonly type: "success" }>["value"];

function toFlowLandingPlan(plan: StackLandingPlan): FlowLandingPlan {
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
		managedSlotConflicts: plan.managedSlotConflicts.map((conflict) => ({
			branch: conflict.branch,
			path: conflict.path,
			kind: conflict.type,
		})),
		descendantMaintenance: toFlowDescendantMaintenance(plan.descendantMaintenance),
	};
}

function toFlowDescendantMaintenance(
	plan: StackLandingPlan["descendantMaintenance"],
): FlowLandingPlan["descendantMaintenance"] {
	if (plan.type === "none") return { kind: "none", branches: [] };
	if (plan.type === "auto") {
		return { kind: "auto", branches: [...plan.branches], targetBranch: plan.targetBranch };
	}
	return {
		kind: "skipped",
		branches: [...plan.branches],
		targetBranch: plan.targetBranch,
		conflicts: plan.conflicts.map((conflict) => ({
			branch: conflict.branch,
			path: conflict.path,
			kind: conflict.type,
		})),
		reason: plan.reason,
	};
}

export function toLandStackFailure(failureValue: LandingFailure): LandStackFailure {
	if (failureValue.type === "domain") {
		const options = landStackFailureOptionsForDomainFailure(failureValue);
		if (failureValue.reason === "dirty-worktree") {
			return landStackFailure("Working tree is dirty; refusing to start stack landing.", options);
		}
		return landStackFailure(failureValue.message, options);
	}
	return landStackFailure(failureValue.message, boundaryFailureOptions(failureValue));
}

function boundaryFailureOptions(
	failureValue: Exclude<LandingFailure, { readonly type: "domain" }>,
) {
	if (failureValue.type !== "boundary") return {};
	return {
		...(failureValue.displayCommand === undefined
			? {}
			: { commandDisplay: failureValue.displayCommand }),
		...(failureValue.execResult === undefined ? {} : { result: failureValue.execResult }),
		...(failureValue.suggestedAction === undefined
			? {}
			: { suggestedAction: failureValue.suggestedAction }),
	};
}

function landStackFailureOptionsForDomainFailure(
	failureValue: Extract<LandingFailure, { readonly type: "domain" }>,
) {
	return {
		...(failureValue.failedBranch === undefined ? {} : { failedBranch: failureValue.failedBranch }),
		...(failureValue.failedPrNumber === undefined ? {} : { failedPr: failureValue.failedPrNumber }),
		...(failureValue.suggestedAction === undefined
			? {}
			: { suggestedAction: failureValue.suggestedAction }),
	};
}

export function formatPrSubmitRequirement(
	requirement: Pick<PrSubmitRequirement, "branch" | "prNumber" | "reasons">,
): string {
	return `- #${requirement.prNumber} ${requirement.branch}: ${requirement.reasons.join("; ")}`;
}
