import type {
	LandedPullRequest,
	LandingCleanupPolicy,
	LandingFailure,
	LandingPlan,
	ManagedSlotWorktree,
	PostTargetExecutionReport,
	RetainedLocalBranchCleanup,
} from "../types.ts";
import { landingExecutionFailure } from "../results.ts";
import type { StackLandingShape } from "../preflight.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import type { LandExecutionStatusProgress } from "./host-seams.ts";
import { blockedDescendantMaintenanceFailure } from "./maintenance-plan.ts";
import {
	branchPreDeleteCheckFailure,
	checkBranchBeforeDelete,
	localBranchDeletionFailure,
} from "./maintenance-safety.ts";
import { reconcileDescendantRoots } from "./descendant-reconciliation.ts";
import type { SelectedLandingState } from "./merge-loop.ts";
import { isManagedSlotPath, slotNameFromPath } from "../worktree-paths.ts";

export type PostTargetPlan =
	| { readonly type: "none" }
	| { readonly type: "blocked"; readonly branches: readonly string[] }
	| {
			readonly type: "reconcile";
			readonly roots: readonly string[];
			readonly branches: readonly string[];
	  };

export function planPostTargetActions(plan: LandingPlan): PostTargetPlan {
	if (plan.stack.remainingLandingBranches.length > 0) {
		return {
			type: "reconcile",
			roots: [plan.stack.remainingLandingBranches[0]!],
			branches: [...plan.stack.remainingLandingBranches],
		};
	}
	if (plan.descendantMaintenance.type === "blocked") {
		return { type: "blocked", branches: [...plan.descendantMaintenance.branches] };
	}
	if (plan.descendantMaintenance.type === "auto") {
		return {
			type: "reconcile",
			roots: [...plan.descendantMaintenance.targetBranches],
			branches: [...plan.descendantMaintenance.branches],
		};
	}
	return { type: "none" };
}

export type PostTargetReconciliationResult =
	| { readonly type: "completed"; readonly report: PostTargetExecutionReport }
	| {
			readonly type: "failed";
			readonly report: PostTargetExecutionReport;
			readonly failure: LandingFailure;
	  };

export async function reconcilePostTarget(
	executionContext: LandExecutionContext,
	plan: LandingPlan,
	selectedState: SelectedLandingState,
): Promise<PostTargetReconciliationResult> {
	const action = planPostTargetActions(plan);
	if (action.type === "none") return { type: "completed", report: { type: "not-needed" } };
	const finalLanded = selectedState.landed.at(-1);
	if (finalLanded === undefined)
		throw new Error("Post-target reconciliation requires a landed PR.");
	if (action.type === "blocked") {
		const failure = blockedDescendantMaintenanceFailure(
			plan,
			finalLanded.branch,
			finalLanded.number,
		);
		return {
			type: "failed",
			report: { type: "failed", branches: action.branches, failure },
			failure,
		};
	}
	const state = {
		expectedShas: new Map(selectedState.expectedLocalShas),
		warnings: [],
	};
	const reconciliation = await reconcileDescendantRoots(executionContext, {
		plan,
		prNumber: finalLanded.number,
		landedBranch: finalLanded.branch,
		state,
		maintenance: { mode: "required-descendants", branches: action.roots },
		affectedBranches: action.branches,
	});
	if (reconciliation.kind === "halt") {
		return {
			type: "failed",
			report: {
				type: "failed",
				branches: reconciliation.reconciledBranches,
				failure: reconciliation.failure,
			},
			failure: reconciliation.failure,
		};
	}
	return {
		type: "completed",
		report: { type: "reconciled", branches: reconciliation.reconciledBranches },
	};
}

export interface StrictCleanupReport {
	readonly deleted: readonly string[];
	readonly retained: readonly RetainedLocalBranchCleanup[];
	readonly managedSlot:
		| { readonly type: "not-applicable" }
		| { readonly type: "preserved"; readonly slotName: string; readonly branch: string }
		| { readonly type: "completed"; readonly freedSlot: ManagedSlotWorktree }
		| {
				readonly type: "failed";
				readonly freedSlot?: ManagedSlotWorktree;
				readonly failure: LandingFailure;
		  };
}

export type StrictCleanupResult =
	| { readonly type: "completed"; readonly report: StrictCleanupReport }
	| {
			readonly type: "failed";
			readonly failedPhase: "landed-branch-cleanup" | "managed-slot-cleanup";
			readonly report: StrictCleanupReport;
			readonly failure: LandingFailure;
	  };

export async function runStrictLandedBranchCleanup(options: {
	readonly executionContext: LandExecutionContext;
	readonly progress: LandExecutionStatusProgress;
	readonly plan: LandingPlan;
	readonly shape: StackLandingShape;
	readonly landed: readonly LandedPullRequest[];
	readonly policy: LandingCleanupPolicy;
	readonly preserveManagedSlot?: boolean;
}): Promise<StrictCleanupResult> {
	const retained = options.landed.map((entry) => ({ branch: entry.branch }));
	const slotName = isManagedSlotPath(options.shape.repoRoot)
		? slotNameFromPath(options.shape.repoRoot)
		: undefined;
	if (options.policy === "preserve") {
		return {
			type: "completed",
			report: {
				deleted: [],
				retained,
				managedSlot:
					slotName === undefined
						? { type: "not-applicable" }
						: { type: "preserved", slotName, branch: options.shape.stack.actualCurrentBranch },
			},
		};
	}

	const allowedChildren = new Set(options.plan.stack.remainingLandingBranches);
	for (const branch of options.plan.stack.descendantBranches) allowedChildren.add(branch);
	for (const landed of options.landed) allowedChildren.add(landed.branch);
	for (const landed of options.landed) {
		const check = await checkBranchBeforeDelete(options.executionContext, {
			repoRoot: options.plan.repoRoot,
			metadataDbPath: options.plan.metadataDbPath,
			prNumber: landed.number,
			branch: landed.branch,
			allowedChildren,
		});
		if (check !== undefined) {
			const failure = branchPreDeleteCheckFailure(check);
			return {
				type: "failed",
				failedPhase: "landed-branch-cleanup",
				report: { deleted: [], retained, managedSlot: { type: "not-applicable" } },
				failure,
			};
		}
	}

	let freedSlot: ManagedSlotWorktree | undefined;
	if (slotName !== undefined && options.preserveManagedSlot !== true) {
		freedSlot = {
			type: "managed-slot",
			branch: options.shape.stack.actualCurrentBranch,
			path: options.shape.repoRoot,
			slotName,
		};
		options.progress.setStatus(`freeing ${slotName}...`);
		const free = await options.executionContext.land.worktrees.freeSlots({
			repoRoot: options.shape.repoRoot,
			slots: [freedSlot],
		});
		if (free.type === "failure") {
			const failure = landingExecutionFailure(`PRs were landed, but freeing ${slotName} failed.`, {
				suggestedAction: `Free ${slotName}, then delete the landed local branches manually when safe.`,
			});
			return {
				type: "failed",
				failedPhase: "managed-slot-cleanup",
				report: { deleted: [], retained, managedSlot: { type: "failed", failure } },
				failure,
			};
		}
	}

	const deleted: string[] = [];
	for (const landed of [...options.landed].reverse()) {
		const immediate = await checkBranchBeforeDelete(options.executionContext, {
			repoRoot: options.plan.repoRoot,
			metadataDbPath: options.plan.metadataDbPath,
			prNumber: landed.number,
			branch: landed.branch,
			allowedChildren,
		});
		if (immediate !== undefined) {
			const failure = branchPreDeleteCheckFailure(immediate);
			return cleanupFailure(failure, deleted, options.landed, freedSlot);
		}
		options.progress.setStatus(`deleting ${landed.branch}...`);
		const deletion = await options.executionContext.land.graphite.deleteLocalBranchRetaining({
			repoRoot: options.plan.repoRoot,
			branch: landed.branch,
		});
		if (deletion.type === "retained") {
			const failure = landingExecutionFailure(
				`PR #${landed.number} merged, but strict cleanup could not delete local Graphite branch ${landed.branch} because it is checked out at ${deletion.path}.`,
				{
					failedBranch: landed.branch,
					failedPrNumber: landed.number,
					suggestedAction: `Switch or detach ${deletion.path} from ${landed.branch}, then delete the branch manually when safe.`,
				},
			);
			return cleanupFailure(failure, deleted, options.landed, freedSlot, {
				branch: deletion.branch,
				path: deletion.path,
			});
		}
		if (deletion.type === "failed") {
			const failure = localBranchDeletionFailure({
				branch: landed.branch,
				prNumber: landed.number,
				commandDisplay: deletion.commandDisplay,
				result: deletion.result,
				isLikelyInProgressGitOperation: deletion.isLikelyInProgressGitOperation,
			});
			return cleanupFailure(failure, deleted, options.landed, freedSlot);
		}
		deleted.push(landed.branch);
		allowedChildren.delete(landed.branch);
	}
	return {
		type: "completed",
		report: {
			deleted,
			retained: [],
			managedSlot:
				slotName !== undefined && options.preserveManagedSlot === true
					? {
							type: "preserved",
							slotName,
							branch: options.shape.stack.actualCurrentBranch,
						}
					: freedSlot === undefined
						? { type: "not-applicable" }
						: { type: "completed", freedSlot },
		},
	};
}

function cleanupFailure(
	failure: LandingFailure,
	deleted: readonly string[],
	landed: readonly LandedPullRequest[],
	freedSlot: ManagedSlotWorktree | undefined,
	knownRetained?: RetainedLocalBranchCleanup,
): StrictCleanupResult {
	const deletedSet = new Set(deleted);
	return {
		type: "failed",
		failedPhase: "landed-branch-cleanup",
		report: {
			deleted: [...deleted],
			retained: landed
				.filter((entry) => !deletedSet.has(entry.branch))
				.map((entry) =>
					entry.branch === knownRetained?.branch ? knownRetained : { branch: entry.branch },
				),
			managedSlot:
				freedSlot === undefined
					? { type: "not-applicable" }
					: { type: "failed", freedSlot, failure },
		},
		failure,
	};
}
