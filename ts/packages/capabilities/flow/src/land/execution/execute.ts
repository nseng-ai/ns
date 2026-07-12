// Canonical stack-landing request executor.
//
// Owns the full execution lifecycle for a LandingRequest: discovery, preflight planning,
// confirmation, pre-merge preparation, the merge loop, per-merge Graphite maintenance, and
// post-landing managed-slot cleanup. Every exit returns a LandingExecutionResult whose report
// carries the facts observed up to that point; phases are recorded from work that actually ran,
// never synthesized from plan shape.

import {
	buildStackLandingPlan,
	loadStackLandingShape,
	type StackLandingShape,
} from "../preflight.ts";
import { landingCancelledBeforeMergeFailure, landSuccess } from "../results.ts";
import type {
	LandContext,
	LandedChunk,
	LandedPullRequest,
	LandingCleanupReport,
	LandingExecutionApprovals,
	LandingExecutionReport,
	LandingExecutionResult,
	LandingFailure,
	LandingPhase,
	LandingPhaseOutcome,
	LandingPlan,
	LandingRequest,
	LandingWarning,
	ManagedSlotWorktree,
	MergeMaintenanceCleanupReport,
	PostLandingSlotCleanupReport,
} from "../types.ts";
import type { LandConfirmationGateway, LandExecutionProgress } from "./host-seams.ts";
import { runMergeLoop, type ObservedDescendantMaintenance } from "./merge-loop.ts";
import {
	planManagedSlotPostLandingCleanup,
	postLandingCleanupSkipReport,
	resolveManagedSlotPostLandingCleanupDecision,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
} from "./post-landing-cleanup.ts";
import { confirmAndFreeManagedSlots, submitRequiredUpdatesAndRecheckPlan } from "./pre-merge.ts";

export interface LandStackExecutionHost {
	readonly confirmation: LandConfirmationGateway;
	readonly progress: LandExecutionProgress;
}

export interface ExecuteLandingOptions {
	/** Temporary compatibility seam for confirmations already granted by the calling host. */
	readonly approvals?: LandingExecutionApprovals;
	/**
	 * Already-loaded landing shape from the calling host's routing/presentation pass. Avoids
	 * re-running discovery commands; strict pre-merge rechecks still run during execution.
	 */
	readonly preparedShape?: StackLandingShape;
}

const CLEANUP_NOT_RUN: PostLandingSlotCleanupReport = {
	type: "not-run",
	reason: "landing did not reach post-landing cleanup",
};

interface ReportDraft {
	readonly target: LandingRequest["target"];
	readonly mode: LandingRequest["mode"];
	repoRoot?: string;
	plan?: LandingPlan;
	phases: LandingPhaseOutcome[];
	landedChunks: readonly LandedChunk[];
	warnings: readonly LandingWarning[];
	preMergeFreedSlots: readonly ManagedSlotWorktree[];
	mergeMaintenanceCleanup: MergeMaintenanceCleanupReport;
	postLandingSlotCleanup: PostLandingSlotCleanupReport;
}

export async function executeLandingRequest(
	context: LandContext,
	request: LandingRequest,
	host: LandStackExecutionHost,
	options: ExecuteLandingOptions = {},
): Promise<LandingExecutionResult> {
	const approvals = options.approvals ?? {};
	const draft: ReportDraft = {
		target: request.target,
		mode: request.mode,
		phases: [],
		landedChunks: [],
		warnings: [],
		preMergeFreedSlots: [],
		mergeMaintenanceCleanup: { deletedLocalBranches: [], retainedLocalBranches: [] },
		postLandingSlotCleanup: CLEANUP_NOT_RUN,
	};

	if (request.target.type !== "stack") {
		return failedResult(draft, "request-validation", {
			type: "not-implemented",
			phase: "request-validation",
			message:
				"@nseng-ai/flow land preflight planning currently supports stack landing targets only.",
		});
	}

	const loadedShape =
		options.preparedShape === undefined
			? await loadStackLandingShape(context, request.cwd)
			: landSuccess(options.preparedShape);
	if (loadedShape.type === "failure") {
		return failedResult(draft, "repo-discovery", loadedShape.failure);
	}
	const shape = loadedShape.value;
	draft.repoRoot = shape.repoRoot;
	draft.phases.push(completed("repo-discovery"), completed("stack-shape"));

	const cleanupRequest: PostLandingCleanupRequest = {
		mode: request.mode,
		policy: request.cleanup,
	};

	if (
		shape.stack.actualCurrentBranch === shape.stack.trunk ||
		shape.stack.landingBranches.length === 0
	) {
		const preview = planManagedSlotPostLandingCleanup({ cleanup: cleanupRequest, shape });
		if (preview !== undefined) {
			return await executeCleanupOnlyLanding({
				context,
				host,
				shape,
				cleanupRequest,
				approvals,
				draft,
			});
		}
		// No applicable cleanup: fall through so preflight reports the canonical
		// nothing-to-land failure.
	}

	const plan = await buildStackLandingPlan(context, request.cwd, {
		shouldAllowSubmitRequiredState: request.preflight.shouldAllowSubmitRequiredState,
		shape,
		...(request.target.landingBranchLimit === undefined
			? {}
			: { landingBranchLimit: request.target.landingBranchLimit }),
	});
	if (plan.type === "failure") {
		return failedResult(draft, "preflight", plan.failure);
	}
	draft.plan = plan.value;
	draft.phases.push(completed("preflight"));
	host.progress.planRecalculated(plan.value);

	if (request.mode === "dry-run") {
		draft.phases.push(completed("dry-run"));
		draft.postLandingSlotCleanup = postLandingCleanupSkipReport(cleanupRequest, shape);
		return completedResult(draft);
	}

	if (!approvals.isMainConfirmationAlreadyApproved) {
		const decision = await host.confirmation.confirm({ kind: "main-landing", plan: plan.value });
		if (decision.type !== "approved") {
			const failure =
				decision.type === "declined" ? landingCancelledBeforeMergeFailure() : decision.failure;
			return failedResult(draft, "confirmation", failure);
		}
		draft.phases.push(completed("confirmation"));
	} else {
		draft.phases.push(skipped("confirmation", "approved upfront before canonical execution"));
	}

	// Resolve cleanup authorization before any merge mutation; the mutation itself only runs
	// after a fully successful landing.
	const cleanupDecision = await resolveManagedSlotPostLandingCleanupDecision({
		confirmation: host.confirmation,
		isConfirmationAlreadyApproved: approvals.isPostLandingCleanupAlreadyApproved ?? false,
		cleanup: cleanupRequest,
		shape,
	});
	if (cleanupDecision.type === "failure") {
		return failedResult(draft, "confirmation", cleanupDecision.failure);
	}

	host.progress.note(formatPreparingLandingMilestone(plan.value));

	let readyPlan = plan.value;
	if (readyPlan.managedSlotConflicts.length > 0) {
		const freed = await confirmAndFreeManagedSlots({
			context,
			host,
			plan: readyPlan,
			...(approvals.isPreMergeConfirmationAlreadyApproved === undefined
				? {}
				: { confirmationAlreadyApproved: approvals.isPreMergeConfirmationAlreadyApproved }),
		});
		if (freed.type === "failure") {
			return failedResult(draft, "submit-preparation", freed.failure);
		}
		draft.preMergeFreedSlots = freed.value;
	}
	if (readyPlan.prSubmitRequirements.length > 0) {
		const submitted = await submitRequiredUpdatesAndRecheckPlan({
			context,
			host,
			cwd: request.cwd,
			plan: readyPlan,
			...(approvals.isPreMergeConfirmationAlreadyApproved === undefined
				? {}
				: { confirmationAlreadyApproved: approvals.isPreMergeConfirmationAlreadyApproved }),
		});
		if (submitted.type === "failure") {
			return failedResult(draft, "submit-preparation", submitted.failure);
		}
		readyPlan = submitted.value;
		draft.plan = readyPlan;
	}
	if (plan.value.managedSlotConflicts.length > 0 || plan.value.prSubmitRequirements.length > 0) {
		draft.phases.push(completed("submit-preparation"));
	}

	const mergeOutcome = await runMergeLoop({
		context,
		progress: host.progress,
		plan: readyPlan,
		warnings: [],
	});
	if (mergeOutcome.type === "failure") {
		draft.warnings = mergeOutcome.warnings;
		draft.landedChunks = landedChunks(readyPlan, mergeOutcome.landed);
		draft.mergeMaintenanceCleanup = {
			deletedLocalBranches: mergeOutcome.deletedLocalBranches,
			retainedLocalBranches: mergeOutcome.cleanup.retainedLocalBranches,
		};
		pushObservedMaintenancePhases(draft, mergeOutcome.descendantMaintenance);
		return failedResult(draft, "merge", mergeOutcome.failure);
	}

	draft.warnings = mergeOutcome.value.warnings;
	draft.landedChunks = landedChunks(readyPlan, mergeOutcome.value.landed);
	draft.mergeMaintenanceCleanup = {
		deletedLocalBranches: mergeOutcome.value.deletedLocalBranches,
		retainedLocalBranches: mergeOutcome.value.cleanup.retainedLocalBranches,
	};
	draft.phases.push(completed("merge"));
	pushObservedMaintenancePhases(draft, mergeOutcome.value.descendantMaintenance);

	const cleanupRun = await runManagedSlotPostLandingCleanup({
		landContext: context,
		progress: host.progress,
		cleanup: cleanupRequest,
		shape,
		cleanupDecision: cleanupDecision.value,
	});
	draft.postLandingSlotCleanup = cleanupRun.outcome;
	if (cleanupRun.type === "failure") {
		return failedResult(draft, "post-landing-cleanup", cleanupRun.failure);
	}
	draft.phases.push(postLandingCleanupPhase(cleanupRun.outcome));
	return completedResult(draft);
}

interface ExecuteCleanupOnlyLandingOptions {
	readonly context: LandContext;
	readonly host: LandStackExecutionHost;
	readonly shape: StackLandingShape;
	readonly cleanupRequest: PostLandingCleanupRequest;
	readonly approvals: LandingExecutionApprovals;
	readonly draft: ReportDraft;
}

/**
 * Cleanup-only execution for a managed-slot checkout on trunk or with no PR path: a valid
 * canonical execution with merge skipped, not a nothing-to-land failure.
 */
async function executeCleanupOnlyLanding(
	options: ExecuteCleanupOnlyLandingOptions,
): Promise<LandingExecutionResult> {
	const { context, host, shape, cleanupRequest, approvals, draft } = options;
	draft.phases.push(
		skipped(
			"merge",
			`Current branch is ${shape.stack.actualCurrentBranch}, which is trunk or has no PR path to land; running post-landing cleanup only.`,
		),
	);

	const cleanupDecision = await resolveManagedSlotPostLandingCleanupDecision({
		confirmation: host.confirmation,
		isConfirmationAlreadyApproved: approvals.isPostLandingCleanupAlreadyApproved ?? false,
		cleanup: cleanupRequest,
		shape,
	});
	if (cleanupDecision.type === "failure") {
		return failedResult(draft, "confirmation", cleanupDecision.failure);
	}

	const cleanupRun = await runManagedSlotPostLandingCleanup({
		landContext: context,
		progress: host.progress,
		cleanup: cleanupRequest,
		shape,
		cleanupDecision: cleanupDecision.value,
	});
	draft.postLandingSlotCleanup = cleanupRun.outcome;
	if (cleanupRun.type === "failure") {
		return failedResult(draft, "post-landing-cleanup", cleanupRun.failure);
	}
	draft.phases.push(postLandingCleanupPhase(cleanupRun.outcome));
	return completedResult(draft);
}

function pushObservedMaintenancePhases(
	draft: ReportDraft,
	descendantMaintenance: ObservedDescendantMaintenance,
): void {
	if (descendantMaintenance.type === "completed") {
		draft.phases.push(completed("descendant-maintenance"));
	} else if (descendantMaintenance.type === "skipped") {
		draft.phases.push(skipped("descendant-maintenance", descendantMaintenance.reason));
	}
	const cleanupFacts =
		draft.mergeMaintenanceCleanup.deletedLocalBranches.length +
		draft.mergeMaintenanceCleanup.retainedLocalBranches.length;
	if (cleanupFacts > 0) {
		draft.phases.push(completed("merge-maintenance-cleanup"));
	} else if (descendantMaintenance.type !== "not-attempted") {
		draft.phases.push(
			skipped("merge-maintenance-cleanup", "no local branch cleanup was performed"),
		);
	}
}

function postLandingCleanupPhase(outcome: PostLandingSlotCleanupReport): LandingPhaseOutcome {
	switch (outcome.type) {
		case "completed":
			return completed("post-landing-cleanup");
		case "not-applicable":
			return skipped("post-landing-cleanup", "current worktree is not a managed slot");
		case "preserved":
			return skipped(
				"post-landing-cleanup",
				"cleanup policy preserves the current slot and local branch",
			);
		case "dry-run":
			return skipped("post-landing-cleanup", "dry run performs no cleanup mutation");
		case "not-run":
			return skipped("post-landing-cleanup", outcome.reason);
		case "declined":
		case "failed":
			// Declined and failed cleanup surface as a failed result before this helper runs.
			return skipped("post-landing-cleanup", "cleanup did not complete");
	}
}

function completed(phase: LandingPhase): LandingPhaseOutcome {
	return { type: "completed", phase };
}

function skipped(phase: LandingPhase, reason: string): LandingPhaseOutcome {
	return { type: "skipped", phase, reason };
}

function completedResult(draft: ReportDraft): LandingExecutionResult {
	return { type: "completed", report: reportFromDraft(draft) };
}

function failedResult(
	draft: ReportDraft,
	phase: LandingPhase,
	failure: LandingFailure,
): LandingExecutionResult {
	draft.phases.push({ type: "failed", phase, failure });
	return { type: "failed", report: reportFromDraft(draft), failure };
}

function reportFromDraft(draft: ReportDraft): LandingExecutionReport {
	const cleanup: LandingCleanupReport = {
		preMergeFreedSlots: draft.preMergeFreedSlots,
		mergeMaintenanceCleanup: draft.mergeMaintenanceCleanup,
		postLandingSlotCleanup: draft.postLandingSlotCleanup,
	};
	return {
		target: draft.target,
		mode: draft.mode,
		...(draft.repoRoot === undefined ? {} : { repoRoot: draft.repoRoot }),
		...(draft.plan === undefined ? {} : { plan: draft.plan }),
		phases: [...draft.phases],
		landedChunks: draft.landedChunks,
		warnings: draft.warnings,
		cleanup,
	};
}

function landedChunks(
	plan: LandingPlan,
	landed: readonly LandedPullRequest[],
): readonly LandedChunk[] {
	return landed.length === 0
		? []
		: [{ index: 0, landingTargetBranch: plan.stack.landingTargetBranch, landed: [...landed] }];
}

function formatPreparingLandingMilestone(plan: LandingPlan): string {
	return `Preparing to land ${plan.stack.landingBranches.length} PR${plan.stack.landingBranches.length === 1 ? "" : "s"} through ${plan.stack.landingTargetBranch}...`;
}
