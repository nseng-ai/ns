// Canonical stack-landing request executor.
//
// Owns the full execution lifecycle for a LandingRequest: discovery, preflight planning,
// confirmation, pre-merge preparation, the merge loop, per-merge Graphite reconciliation, and
// post-landing managed-slot cleanup. Every exit returns a LandingExecutionResult whose report
// carries the facts observed up to that point; phases are recorded from work that actually ran,
// never synthesized from plan shape.

import { optionalEntry } from "@nseng-ai/foundation/primitives";

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
	LandingCompletedExecutionReport,
	LandingCompletionDisposition,
	LandingExecutionReport,
	LandingExecutionResult,
	LandingFailure,
	LandingPhase,
	LandingPhaseOutcome,
	LandingPlan,
	LandingRequest,
	LandingWarning,
	ManagedSlotWorktree,
	LandedBranchCleanupReport,
	PostLandingSlotCleanupReport,
} from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import type { LandConfirmationGateway, LandExecutionProgress } from "./host-seams.ts";
import { runPostMergeStackReconciliation } from "./post-merge-stack-reconciliation.ts";
import { cleanUpLandedBranches } from "./reconciliation.ts";
import { runMergeLoop, type MergeLoopResult, type MergeLoopState } from "./merge-loop.ts";
import {
	planManagedSlotPostLandingCleanup,
	postLandingCleanupSkipReport,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
} from "./post-landing-cleanup.ts";
import { confirmAndFreeManagedSlots, submitRequiredUpdatesAndRecheckPlan } from "./pre-merge.ts";

export interface LandStackExecutionHost {
	readonly confirmation: LandConfirmationGateway;
	readonly progress: LandExecutionProgress;
}

export type LandingExecutionSource =
	| { readonly type: "discover" }
	| { readonly type: "prepared"; readonly shape: StackLandingShape };

export interface ExecuteLandingRequestOptions {
	readonly context: LandContext;
	readonly request: LandingRequest;
	readonly host: LandStackExecutionHost;
	readonly source: LandingExecutionSource;
}

const CLEANUP_NOT_RUN: PostLandingSlotCleanupReport = {
	type: "not-run",
	reason: "landing did not reach post-landing cleanup",
};

interface ReportDraft {
	readonly target: LandingRequest["target"];
	readonly mode: LandingRequest["mode"];
	completionDisposition: LandingCompletionDisposition;
	repoRoot?: string;
	plan?: LandingPlan;
	phases: LandingPhaseOutcome[];
	landedChunks: readonly LandedChunk[];
	warnings: readonly LandingWarning[];
	preMergeFreedSlots: readonly ManagedSlotWorktree[];
	landedBranchCleanup: LandedBranchCleanupReport;
	postLandingSlotCleanup: PostLandingSlotCleanupReport;
}

export async function executeLandingRequest(
	options: ExecuteLandingRequestOptions,
): Promise<LandingExecutionResult> {
	const { context, request, host } = options;
	const draft: ReportDraft = {
		target: request.target,
		mode: request.mode,
		completionDisposition: { type: "stack-execution" },
		phases: [],
		landedChunks: [],
		warnings: [],
		preMergeFreedSlots: [],
		landedBranchCleanup: { deletedLocalBranches: [], retainedLocalBranches: [] },
		postLandingSlotCleanup: CLEANUP_NOT_RUN,
	};

	if (request.target.type !== "stack") {
		return failedResult(draft, "request-validation", {
			type: "not-implemented",
			phase: "request-validation",
			message:
				options.source.type === "prepared"
					? "A prepared stack landing shape cannot execute a single-branch pull-request target."
					: "@nseng-ai/flow land preflight planning currently supports stack landing targets only.",
		});
	}
	if (
		options.source.type === "prepared" &&
		request.target.landingBranchLimit !== undefined &&
		request.target.landingBranchLimit > options.source.shape.stack.landingBranches.length
	) {
		return failedResult(draft, "request-validation", {
			type: "not-implemented",
			phase: "request-validation",
			message: `Prepared landing shape contains ${options.source.shape.stack.landingBranches.length} landing branches and cannot represent the requested scope of ${request.target.landingBranchLimit}.`,
		});
	}

	const loadedShape =
		options.source.type === "discover"
			? await loadStackLandingShape(context, request.cwd)
			: landSuccess(options.source.shape);
	if (loadedShape.type === "failure") {
		return failedResult(draft, "repo-discovery", loadedShape.failure);
	}
	const shape = loadedShape.value;
	draft.repoRoot = shape.repoRoot;
	draft.phases.push(
		options.source.type === "discover"
			? completed("repo-discovery")
			: skipped("repo-discovery", "shape supplied by caller"),
		// `stack-shape` records that execution observed a usable shape, not how it was obtained.
		completed("stack-shape"),
	);

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
			draft.completionDisposition = { type: "cleanup-only" };
			return await executeCleanupOnlyLanding({
				context,
				host,
				shape,
				cleanupRequest,
				draft,
			});
		}
		draft.completionDisposition = {
			type: "nothing-to-land",
			currentBranch: shape.stack.actualCurrentBranch,
		};
		return completedResult(draft);
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

	const cleanupPreview = planManagedSlotPostLandingCleanup({ cleanup: cleanupRequest, shape });
	const cleanupChoice =
		request.cleanup === "preserve"
			? planManagedSlotPostLandingCleanup({
					cleanup: { mode: request.mode, policy: "free" },
					shape,
				})
			: undefined;
	const mainDecision = await host.confirmation.confirm({
		kind: "main-landing",
		plan: plan.value,
		...(cleanupPreview === undefined ? {} : { cleanup: cleanupPreview }),
		...optionalEntry("cleanupChoice", cleanupChoice),
	});
	if (mainDecision.type !== "approved") {
		const failure =
			mainDecision.type === "declined"
				? landingCancelledBeforeMergeFailure()
				: mainDecision.failure;
		return failedResult(draft, "confirmation", failure);
	}
	const effectiveCleanupRequest: PostLandingCleanupRequest = {
		...cleanupRequest,
		policy: mainDecision.cleanupPolicy ?? cleanupRequest.policy,
	};
	draft.phases.push(
		mainDecision.approvalSource === "prompted"
			? completed("confirmation")
			: skipped("confirmation", "approved upfront before canonical execution"),
	);

	// The main confirmation preview above discloses cleanup impact; the explicit `--free` policy
	// is the cleanup consent. The mutation itself still runs only after a fully successful
	// landing (or in the explicit cleanup-only path).
	host.progress.note(formatPreparingLandingMilestone(plan.value));

	let readyPlan = plan.value;
	const hasSubmitPreparationWork =
		readyPlan.managedSlotConflicts.length > 0 || readyPlan.prSubmitRequirements.length > 0;
	if (readyPlan.managedSlotConflicts.length > 0) {
		const freed = await confirmAndFreeManagedSlots({ context, host, plan: readyPlan });
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
		});
		if (submitted.type === "failure") {
			return failedResult(draft, "submit-preparation", submitted.failure);
		}
		readyPlan = submitted.value;
		draft.plan = readyPlan;
	}
	if (hasSubmitPreparationWork) draft.phases.push(completed("submit-preparation"));

	const executionContext = {
		land: context,
		progress: host.progress,
	} satisfies LandExecutionContext;
	const mergeOutcome = await runMergeLoop(executionContext, {
		plan: readyPlan,
		warnings: draft.warnings,
	});
	draft.phases.push(...mergeLoopPhaseOutcomes(mergeOutcome));
	if (mergeOutcome.type === "failure") {
		const { observations } = mergeOutcome;
		draft.warnings = observations.warnings;
		draft.landedChunks = landedChunks(readyPlan, observations.landed);
		draft.landedBranchCleanup = {
			deletedLocalBranches: observations.deletedLocalBranches,
			retainedLocalBranches: observations.cleanup.retainedLocalBranches,
		};
		return failedResult(draft, mergeOutcome.failedPhase, mergeOutcome.failure);
	}

	const { landed, reconciliationState } = mergeOutcome;
	draft.landedChunks = landedChunks(readyPlan, landed);
	const postMergeStackReconciliation = await runPostMergeStackReconciliation(executionContext, {
		plan: readyPlan,
		landed,
		state: reconciliationState,
	});
	updateReconciliationReport(draft, reconciliationState);
	draft.phases.push(...postMergeStackReconciliation.phases);
	if (postMergeStackReconciliation.type === "halted") {
		return failedResult(
			draft,
			postMergeStackReconciliation.phase,
			postMergeStackReconciliation.failure,
		);
	}

	if (effectiveCleanupRequest.policy === "preserve") {
		draft.phases.push(
			skipped("landed-branch-cleanup", "cleanup policy preserves landed local branches"),
		);
	} else {
		const cleanup = await cleanUpLandedBranches(
			executionContext,
			readyPlan,
			landed,
			reconciliationState,
		);
		updateReconciliationReport(draft, reconciliationState);
		if (cleanup.kind === "halt") {
			return failedResult(draft, cleanup.phase, cleanup.failure);
		}
		draft.phases.push(completed("landed-branch-cleanup"));
	}

	return await executePostLandingCleanup({
		context,
		host,
		shape,
		cleanupRequest: effectiveCleanupRequest,
		draft,
	});
}

interface ExecuteCleanupOnlyLandingOptions {
	readonly context: LandContext;
	readonly host: LandStackExecutionHost;
	readonly shape: StackLandingShape;
	readonly cleanupRequest: PostLandingCleanupRequest;
	readonly draft: ReportDraft;
}

/**
 * Cleanup-only execution for a managed-slot checkout on trunk or with no PR path: a valid
 * canonical execution with merge skipped, not a nothing-to-land failure.
 */
async function executeCleanupOnlyLanding(
	options: ExecuteCleanupOnlyLandingOptions,
): Promise<LandingExecutionResult> {
	const { context, host, shape, cleanupRequest, draft } = options;
	draft.phases.push(
		skipped(
			"merge",
			`Current branch is ${shape.stack.actualCurrentBranch}, which is trunk or has no PR path to land; running post-landing cleanup only.`,
		),
	);

	return await executePostLandingCleanup({
		context,
		host,
		shape,
		cleanupRequest,
		draft,
	});
}

interface ExecutePostLandingCleanupOptions {
	readonly context: LandContext;
	readonly host: LandStackExecutionHost;
	readonly shape: StackLandingShape;
	readonly cleanupRequest: PostLandingCleanupRequest;
	readonly draft: ReportDraft;
}

async function executePostLandingCleanup(
	options: ExecutePostLandingCleanupOptions,
): Promise<LandingExecutionResult> {
	const cleanupRun = await runManagedSlotPostLandingCleanup({
		landContext: options.context,
		progress: options.host.progress,
		cleanup: options.cleanupRequest,
		shape: options.shape,
	});
	const draft = { ...options.draft, postLandingSlotCleanup: cleanupRun.outcome };
	if (cleanupRun.type === "failure") {
		return failedResult(draft, "post-landing-cleanup", cleanupRun.failure);
	}
	return completedResult({
		...draft,
		phases: [...draft.phases, postLandingCleanupPhase(cleanupRun.outcome)],
	});
}

function updateReconciliationReport(draft: ReportDraft, state: MergeLoopState): void {
	draft.warnings = [...state.warnings];
	draft.landedBranchCleanup = {
		deletedLocalBranches: [...state.deletedBranches],
		retainedLocalBranches: [...state.cleanup.retainedLocalBranches],
	};
}

function mergeLoopPhaseOutcomes(mergeLoopResult: MergeLoopResult): readonly LandingPhaseOutcome[] {
	if (mergeLoopResult.type === "success") return [completed("merge")];

	const { stackReconciliation } = mergeLoopResult.observations;
	const descendantPhases: LandingPhaseOutcome[] = [];
	if (stackReconciliation.type === "completed") {
		descendantPhases.push(completed("post-merge-stack-reconciliation"));
	} else if (stackReconciliation.type === "skipped") {
		descendantPhases.push(skipped("post-merge-stack-reconciliation", stackReconciliation.reason));
	}

	const cleanup = mergeLoopResult.observations.cleanup;
	const deletedLocalBranches = mergeLoopResult.observations.deletedLocalBranches;
	const cleanupPhases: LandingPhaseOutcome[] = [];
	const cleanupFacts = deletedLocalBranches.length + cleanup.retainedLocalBranches.length;
	if (cleanupFacts > 0) {
		cleanupPhases.push(completed("landed-branch-cleanup"));
	} else if (stackReconciliation.type !== "not-attempted") {
		cleanupPhases.push(skipped("landed-branch-cleanup", "no local branch cleanup was performed"));
	}

	switch (mergeLoopResult.failedPhase) {
		case "merge":
			return [...descendantPhases, ...cleanupPhases];
		case "post-merge-stack-reconciliation":
			return [completed("merge"), ...cleanupPhases];
		case "landed-branch-cleanup":
			return [completed("merge"), ...descendantPhases];
		default:
			throw new Error(`Unexpected merge-loop failure phase: ${mergeLoopResult.failedPhase}`);
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
		case "failed":
			// Failed cleanup surfaces as a failed result before this helper runs.
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
	return { type: "completed", report: completedReportFromDraft(draft) };
}

function completedReportFromDraft(draft: ReportDraft): LandingCompletedExecutionReport {
	if (draft.repoRoot === undefined) {
		throw new Error("Completed landing execution must include the repository root.");
	}
	return { ...reportFromDraft(draft), repoRoot: draft.repoRoot };
}

function failedResult(
	draft: ReportDraft,
	failedPhase: LandingPhase,
	failure: LandingFailure,
): LandingExecutionResult {
	const failedExecution = { type: "failed" as const, failedPhase, failure };
	const failedDraft: ReportDraft = {
		...draft,
		phases: [...draft.phases, { type: "failed", phase: failedExecution.failedPhase, failure }],
	};
	return { ...failedExecution, report: reportFromDraft(failedDraft) };
}

function reportFromDraft(draft: ReportDraft): LandingExecutionReport {
	const cleanup: LandingCleanupReport = {
		preMergeFreedSlots: draft.preMergeFreedSlots,
		landedBranchCleanup: draft.landedBranchCleanup,
		postLandingSlotCleanup: draft.postLandingSlotCleanup,
	};
	return {
		target: draft.target,
		mode: draft.mode,
		completionDisposition: draft.completionDisposition,
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
