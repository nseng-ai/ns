// Canonical stack-landing request executor.
//
// Owns the full execution lifecycle for a LandingRequest: discovery, preflight planning,
// confirmation, pre-merge preparation, the merge loop, per-merge Graphite maintenance, and
// post-landing managed-slot cleanup. Every exit returns a LandingExecutionResult whose report
// carries the facts observed up to that point; phases are recorded from work that actually ran,
// never synthesized from plan shape.

import { optionalEntry } from "@nseng-ai/foundation/primitives";

import {
	buildStackLandingPlan,
	loadStackLandingShape,
	type StackLandingShape,
} from "../preflight.ts";
import {
	landingCancelledBeforeMergeFailure,
	landingExecutionFailure,
	landSuccess,
} from "../results.ts";
import type {
	LandContext,
	LandedChunk,
	LandedPullRequest,
	LandingCleanupReport,
	LandingCompletedExecutionReport,
	LandingCompletionDisposition,
	LandingContinuationReport,
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
	PostTargetExecutionReport,
} from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import type { LandConfirmationGateway, LandExecutionProgress } from "./host-seams.ts";
import { runMergeLoop, type MergeLoopResult } from "./merge-loop.ts";
import {
	planPostTargetActions,
	reconcilePostTarget,
	runStrictLandedBranchCleanup,
} from "./post-target-actions.ts";
import {
	planManagedSlotPostLandingCleanup,
	postLandingCleanupSkipReport,
	runManagedSlotPostLandingCleanup,
	type PostLandingCleanupRequest,
} from "./post-landing-cleanup.ts";
import { confirmAndFreeManagedSlots, submitRequiredUpdatesAndRecheckPlan } from "./pre-merge.ts";
import { executeUpstackContinuation, snapshotUpstackContinuation } from "./upstack-continuation.ts";

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
	postTarget: PostTargetExecutionReport;
	landedBranchCleanup: LandedBranchCleanupReport;
	managedSlotCleanup: PostLandingSlotCleanupReport;
	continuation: LandingContinuationReport;
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
		postTarget: { type: "not-run", reason: "selected landing has not completed" },
		landedBranchCleanup: { deleted: [], retained: [] },
		managedSlotCleanup: CLEANUP_NOT_RUN,
		continuation: { type: "not-requested" },
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

	if (request.continuation.type === "upstack") {
		const continuation = await snapshotUpstackContinuation({
			context,
			repoRoot: shape.repoRoot,
			metadataDbPath: shape.metadataDbPath,
			stack: shape.stack,
		});
		draft.continuation = continuation.report;
		if (continuation.type === "unavailable") {
			draft.managedSlotCleanup = continuationPreservationReport(shape);
			return failedResult(draft, "upstack-continuation", continuation.failure);
		}
	}

	if (
		shape.stack.actualCurrentBranch === shape.stack.trunk ||
		shape.stack.landingBranches.length === 0
	) {
		if (request.continuation.type === "upstack") {
			draft.completionDisposition = {
				type: "nothing-to-land",
				currentBranch: shape.stack.actualCurrentBranch,
			};
			draft.managedSlotCleanup = continuationPreservationReport(shape);
			draft.phases.push(
				skipped("managed-slot-cleanup", "upstack continuation preserves the invoking slot"),
			);
			return completedResult(draft);
		}
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
		draft.postTarget = { type: "not-run", reason: "dry run performs no reconciliation" };
		draft.phases.push(completed("dry-run"));
		draft.managedSlotCleanup =
			request.continuation.type === "upstack"
				? continuationPreservationReport(shape)
				: postLandingCleanupSkipReport(cleanupRequest, shape);
		return completedResult(draft);
	}

	const cleanupPreview = planManagedSlotPostLandingCleanup({ cleanup: cleanupRequest, shape });
	const cleanupChoice =
		request.cleanup === "preserve" && request.continuation.type !== "upstack"
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
	const { observations } = mergeOutcome;
	draft.warnings = observations.warnings;
	draft.landedChunks = landedChunks(readyPlan, observations.landed);
	draft.phases.push(...mergeLoopPhaseOutcomes(mergeOutcome));
	if (mergeOutcome.type === "failure") {
		return failedResult(draft, mergeOutcome.failedPhase, mergeOutcome.failure);
	}

	if (request.continuation.type === "upstack") {
		draft.managedSlotCleanup = continuationPreservationReport(shape);
	}

	if (effectiveCleanupRequest.policy === "preserve" && request.continuation.type === "none") {
		const warning = preservePostTargetWarning(readyPlan);
		if (warning === undefined) {
			draft.postTarget = { type: "not-needed" };
		} else {
			draft.warnings = [...draft.warnings, warning];
			const action = planPostTargetActions(readyPlan);
			if (action.type !== "reconcile") throw new Error("Preserve warning requires survivors.");
			draft.postTarget = {
				type: "deferred",
				firstSurvivor: action.branches[0]!,
				manualAction: warning.message,
			};
		}
		draft.landedBranchCleanup = {
			deleted: [],
			retained: mergeOutcome.selectedState.landed.map((entry) => ({ branch: entry.branch })),
		};
		draft.phases.push(
			skipped("post-target-reconciliation", "preserve policy defers survivor reconciliation"),
		);
	} else {
		if (request.continuation.type === "upstack") {
			if (draft.continuation.type !== "candidate") {
				throw new Error(
					"Successful upstack continuation preflight must produce a candidate branch.",
				);
			}
			const action = planPostTargetActions(readyPlan);
			const immediateSurvivor = action.type === "reconcile" ? action.branches[0] : undefined;
			if (immediateSurvivor !== draft.continuation.branch) {
				return failedResult(
					draft,
					"post-target-reconciliation",
					landingExecutionFailure(
						`Upstack continuation candidate ${draft.continuation.branch} does not match the deterministic immediate survivor ${immediateSurvivor ?? "<none>"}.`,
						{
							failedBranch: draft.continuation.branch,
							suggestedAction:
								"Inspect Graphite topology and the surviving stack before continuing manually.",
						},
					),
				);
			}
		}
		const reconciliation = await reconcilePostTarget(
			executionContext,
			readyPlan,
			mergeOutcome.selectedState,
		);
		draft.postTarget = reconciliation.report;
		if (reconciliation.type === "failed") {
			return failedResult(draft, "post-target-reconciliation", reconciliation.failure);
		}
		draft.phases.push(
			reconciliation.report.type === "not-needed"
				? skipped("post-target-reconciliation", "no surviving branches require reconciliation")
				: completed("post-target-reconciliation"),
		);
	}

	if (request.continuation.type === "upstack") {
		draft.managedSlotCleanup = continuationPreservationReport(shape);
		if (draft.continuation.type !== "candidate") {
			throw new Error("Successful upstack continuation preflight must produce a candidate branch.");
		}
		const continuation = await executeUpstackContinuation({
			context,
			repoRoot: shape.repoRoot,
			originalBranch: shape.stack.actualCurrentBranch,
			candidateBranch: draft.continuation.branch,
		});
		draft.continuation = continuation.report;
		if (continuation.type === "failed") {
			draft.phases.push(
				skipped("managed-slot-cleanup", "upstack continuation preserves the invoking slot"),
			);
			return failedResult(draft, "upstack-continuation", continuation.failure);
		}
		draft.phases.push(completed("upstack-continuation"));
		const cleanup = await runStrictLandedBranchCleanup({
			executionContext,
			progress: host.progress,
			plan: readyPlan,
			shape,
			landed: mergeOutcome.selectedState.landed,
			policy: effectiveCleanupRequest.policy,
			preserveManagedSlot: true,
		});
		draft.landedBranchCleanup = {
			deleted: cleanup.report.deleted,
			retained: cleanup.report.retained,
		};
		draft.managedSlotCleanup = cleanup.report.managedSlot;
		if (cleanup.type === "failed") return failedResult(draft, cleanup.failedPhase, cleanup.failure);
		draft.phases.push(
			effectiveCleanupRequest.policy === "free"
				? completed("landed-branch-cleanup")
				: skipped("landed-branch-cleanup", "preserve policy retains landed branches"),
			skipped("managed-slot-cleanup", "upstack continuation preserves the invoking slot"),
		);
		return completedResult(draft);
	}

	const cleanup = await runStrictLandedBranchCleanup({
		executionContext,
		progress: host.progress,
		plan: readyPlan,
		shape,
		landed: mergeOutcome.selectedState.landed,
		policy: effectiveCleanupRequest.policy,
	});
	draft.landedBranchCleanup = {
		deleted: cleanup.report.deleted,
		retained: cleanup.report.retained,
	};
	draft.managedSlotCleanup = cleanup.report.managedSlot;
	if (cleanup.type === "failed") return failedResult(draft, cleanup.failedPhase, cleanup.failure);
	draft.phases.push(
		completed("landed-branch-cleanup"),
		postLandingCleanupPhase(cleanup.report.managedSlot),
	);
	return completedResult(draft);
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
	const draft = { ...options.draft, managedSlotCleanup: cleanupRun.outcome };
	if (cleanupRun.type === "failure") {
		return failedResult(draft, "managed-slot-cleanup", cleanupRun.failure);
	}
	return completedResult({
		...draft,
		phases: [...draft.phases, postLandingCleanupPhase(cleanupRun.outcome)],
	});
}

function preservePostTargetWarning(plan: LandingPlan): LandingWarning | undefined {
	const firstSurvivor =
		plan.stack.remainingLandingBranches[0] ?? plan.stack.descendantRootBranches[0];
	if (firstSurvivor === undefined) return undefined;
	const command = `gt get ${firstSurvivor} --downstack --no-restack --no-checkout --force --no-interactive`;
	const manualAction = `From the worktree that has ${plan.stack.trunk} checked out, run:\n${command}\nThen inspect, restack, and update the surviving stack.`;
	return {
		level: "warning",
		message: manualAction,
		suggestedAction: manualAction,
		notificationAction: `Reconcile surviving branch ${firstSurvivor} from ${plan.stack.trunk}.`,
	};
}

function mergeLoopPhaseOutcomes(mergeLoopResult: MergeLoopResult): readonly LandingPhaseOutcome[] {
	if (mergeLoopResult.type === "success") return [completed("merge")];
	return mergeLoopResult.failedPhase === "between-selected-maintenance" ? [completed("merge")] : [];
}

function postLandingCleanupPhase(outcome: PostLandingSlotCleanupReport): LandingPhaseOutcome {
	switch (outcome.type) {
		case "completed":
			return completed("managed-slot-cleanup");
		case "not-applicable":
			return skipped("managed-slot-cleanup", "current worktree is not a managed slot");
		case "preserved":
			return skipped(
				"managed-slot-cleanup",
				"cleanup policy preserves the current slot and local branch",
			);
		case "dry-run":
			return skipped("managed-slot-cleanup", "dry run performs no cleanup mutation");
		case "not-run":
			return skipped("managed-slot-cleanup", outcome.reason);
		case "failed":
			// Failed cleanup surfaces as a failed result before this helper runs.
			return skipped("managed-slot-cleanup", "cleanup did not complete");
	}
}

function continuationPreservationReport(shape: StackLandingShape): PostLandingSlotCleanupReport {
	return postLandingCleanupSkipReport({ mode: "execute", policy: "preserve" }, shape);
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
		landedBranches: draft.landedBranchCleanup,
		managedSlot: draft.managedSlotCleanup,
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
		postTarget: draft.postTarget,
		cleanup,
		continuation: draft.continuation,
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
