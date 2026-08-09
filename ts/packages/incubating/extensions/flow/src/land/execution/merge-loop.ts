import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { validateStrictMergeGate } from "../preflight.ts";
import { landFailure, landingExecutionFailure, landSuccess } from "../results.ts";
import {
	boundaryFailureDiagnostics,
	type LandContext,
	type LandedPullRequest,
	type LandingFailure,
	type LandingPhase,
	type LandingPlan,
	type LandingWarning,
	type LandResult,
	type PullRequestFacts,
	type RetainedLocalBranchCleanup,
} from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";
import type { LandExecutionProgress, LandExecutionStep } from "./host-seams.ts";
import { isVerifiedMergedPullRequest } from "./merged-pull-request-verification.ts";
import { reconcileStackAfterMerge } from "./reconciliation.ts";
import {
	planPostMergeStackReconciliationTargets,
	type ReconciliationMode,
} from "./reconciliation-plan.ts";

export interface RemainingCleanup {
	retainedLocalBranches: RetainedLocalBranchCleanup[];
}

export interface MergeLoopState {
	expectedShas: Map<string, string>;
	deletedBranches: Set<string>;
	warnings: LandingWarning[];
	cleanup: RemainingCleanup;
}

export interface PrepareMergeLoopStateOptions {
	readonly context: LandContext;
	readonly repoRoot: string;
	readonly branches: readonly string[];
	readonly warnings: readonly LandingWarning[];
}

export async function prepareMergeLoopState(
	options: PrepareMergeLoopStateOptions,
): Promise<LandResult<MergeLoopState>> {
	const backupRefs = await options.context.git.snapshotBackupRefs({
		repoRoot: options.repoRoot,
		branches: options.branches,
	});
	if (backupRefs.type === "failure") return landFailure(backupRefs.failure);
	return landSuccess({
		expectedShas: new Map(backupRefs.value),
		deletedBranches: new Set(),
		warnings: [...options.warnings],
		cleanup: { retainedLocalBranches: [] },
	});
}

/** Observed post-merge-stack-reconciliation outcome; never inferred from plan shape alone. */
export type ObservedStackReconciliation =
	| { readonly type: "not-attempted" }
	| { readonly type: "completed" }
	| { readonly type: "skipped"; readonly reason: string };

export interface MergeLoopObservations {
	readonly landed: readonly LandedPullRequest[];
	readonly warnings: readonly LandingWarning[];
	readonly cleanup: {
		readonly retainedLocalBranches: readonly RetainedLocalBranchCleanup[];
	};
	readonly deletedLocalBranches: readonly string[];
	readonly stackReconciliation: ObservedStackReconciliation;
}

export type MergeLoopResult =
	| {
			readonly type: "success";
			readonly landed: readonly LandedPullRequest[];
			readonly reconciliationState: MergeLoopState;
	  }
	| {
			readonly type: "failure";
			readonly observations: MergeLoopObservations;
			readonly failure: LandingFailure;
			/** Truthful landing phase of the failure: post-merge reconciliation failures are never `merge`. */
			readonly failedPhase: LandingPhase;
	  };

export interface RunMergeLoopOptions {
	readonly plan: LandingPlan;
	readonly warnings: readonly LandingWarning[];
}

interface WithExecutionStepOptions<T> {
	readonly progress: LandExecutionProgress;
	readonly branch: string;
	readonly step: LandExecutionStep;
	readonly op: () => Promise<LandResult<T>>;
}

async function withExecutionStep<T>(options: WithExecutionStepOptions<T>): Promise<LandResult<T>> {
	options.progress.setStep(options.branch, options.step, "active");
	const result = await options.op();
	options.progress.setStep(
		options.branch,
		options.step,
		result.type === "failure" ? "failed" : "done",
	);
	return result;
}

export async function runMergeLoop(
	executionContext: LandExecutionContext,
	options: RunMergeLoopOptions,
): Promise<MergeLoopResult> {
	const { land: context, progress } = executionContext;
	const { plan } = options;
	const { repoRoot, stack } = plan;
	const landed: LandedPullRequest[] = [];
	let observedStackReconciliation: ObservedStackReconciliation = {
		type: "not-attempted",
	};
	const preparedState = await prepareMergeLoopState({
		context,
		repoRoot,
		branches: [
			...stack.landingBranches,
			...stack.remainingLandingBranches,
			...stack.descendantBranches,
		],
		warnings: options.warnings,
	});
	if (preparedState.type === "failure") {
		return {
			type: "failure",
			observations: snapshotMergeLoopObservations(
				landed,
				{
					warnings: options.warnings,
					cleanup: { retainedLocalBranches: [] },
					deletedLocalBranches: [],
				},
				observedStackReconciliation,
			),
			failure: preparedState.failure,
			failedPhase: "merge",
		};
	}
	const state = preparedState.value;

	for (const [index, branch] of stack.landingBranches.entries()) {
		const gated = await withExecutionStep({
			progress,
			branch,
			step: "gate",
			op: async () => {
				const localSha = await context.git.localBranchSha({ repoRoot, branch });
				if (localSha.type === "failure") return landFailure(localSha.failure);
				const pr = await context.github.pullRequestFacts({
					repoRoot,
					branchOrNumber: branch,
				});
				if (pr.type === "failure") return landFailure(pr.failure);
				const mergeGate = validateStrictMergeGate({
					branch,
					localSha: localSha.value,
					pr: pr.value,
					trunk: stack.trunk,
				});
				if (mergeGate.type === "failure") return landFailure(mergeGate.failure);
				return landSuccess(pr.value);
			},
		});
		if (gated.type === "failure") {
			return mergeLoopFailure(gated.failure, landed, state, observedStackReconciliation);
		}
		const currentPr = gated.value;
		const merged = await withExecutionStep({
			progress,
			branch,
			step: "merge",
			op: async () => {
				progress.note(`Merging PR #${currentPr.number} ${branch}...`);
				progress.setStatus(`merging #${currentPr.number} ${branch} with PR title/body...`);
				const merge = await context.github.squashMergePullRequest({
					repoRoot,
					pullRequest: currentPr,
				});
				return merge.type === "failure"
					? landFailure(stackMergeRejectedFailure(merge.failure, currentPr, branch))
					: landSuccess(undefined);
			},
		});
		if (merged.type === "failure") {
			return mergeLoopFailure(merged.failure, landed, state, observedStackReconciliation);
		}
		const verified = await withExecutionStep({
			progress,
			branch,
			step: "verify",
			op: async () => {
				progress.setStatus(`verifying #${currentPr.number}...`);
				const facts = await context.github.pullRequestFacts({
					repoRoot,
					branchOrNumber: String(currentPr.number),
				});
				if (facts.type === "failure") {
					return landFailure(
						landingExecutionFailure(
							`gh pr merge exited 0, but verification could not load PR #${currentPr.number}; local Graphite cleanup skipped.\n${facts.failure.message}`,
							{
								failedBranch: branch,
								failedPrNumber: currentPr.number,
								suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
							},
						),
					);
				}
				const isVerifiedMerged = isVerifiedMergedPullRequest(facts.value, {
					expectedTrunk: stack.trunk,
					expectedHeadBranch: branch,
				});
				if (!isVerifiedMerged) {
					return landFailure(
						landingExecutionFailure(
							"gh pr merge exited 0 but PR did not verify as MERGED; local Graphite cleanup skipped.",
							{
								failedBranch: branch,
								failedPrNumber: currentPr.number,
								suggestedAction: `Inspect PR #${currentPr.number} on GitHub before deleting or restacking local Graphite branches.`,
							},
						),
					);
				}
				return landSuccess(facts.value);
			},
		});
		if (verified.type === "failure") {
			return mergeLoopFailure(verified.failure, landed, state, observedStackReconciliation);
		}
		const prUrl = verified.value.url ?? currentPr.url;
		const landedPullRequest = {
			branch,
			number: currentPr.number,
			title: currentPr.title,
			...(prUrl ? { url: prUrl } : {}),
		};
		landed.push(landedPullRequest);
		progress.recordMergedPullRequest(landedPullRequest);
		progress.note(`Merged and verified PR #${currentPr.number} ${branch}.`);

		progress.setStep(branch, "restack", "active");
		const nextSelectedBranch = stack.landingBranches[index + 1];
		if (nextSelectedBranch === undefined) {
			progress.setStep(branch, "restack", "skipped");
			continue;
		}
		const reconciliation = await reconcileStackAfterMerge(executionContext, {
			plan,
			step: { index, branch, prNumber: currentPr.number, state },
		});
		observedStackReconciliation = reduceStackReconciliationObservation(
			observedStackReconciliation,
			observeStackReconciliation(
				planPostMergeStackReconciliationTargets(plan, index).mode,
				reconciliation.kind,
			),
		);
		if (reconciliation.kind === "halt") {
			progress.setStep(branch, "restack", "failed");
			return mergeLoopFailure(
				reconciliation.failure,
				landed,
				state,
				observedStackReconciliation,
				reconciliation.phase,
			);
		}
		if (reconciliation.kind === "skip") {
			progress.setStep(branch, "restack", "skipped");
			if (reconciliation.warning !== undefined) state.warnings.push(reconciliation.warning);
		} else {
			progress.setStep(branch, "restack", "done");
		}
	}
	return {
		type: "success",
		landed: [...landed],
		reconciliationState: state,
	};
}

export function reduceStackReconciliationObservation(
	previous: ObservedStackReconciliation,
	next: ObservedStackReconciliation | undefined,
): ObservedStackReconciliation {
	return next ?? previous;
}

function observeStackReconciliation(
	mode: ReconciliationMode,
	kind: "proceed" | "skip" | "halt",
): ObservedStackReconciliation | undefined {
	switch (mode) {
		case "required-next-landing":
			return undefined;
		case "none":
			return { type: "skipped", reason: "no descendant branches require reconciliation" };
		case "blocked-descendants":
			return undefined;
		case "required-descendants":
			return kind === "proceed" ? { type: "completed" } : undefined;
	}
}

interface MergeLoopObservationSource {
	readonly warnings: readonly LandingWarning[];
	readonly cleanup: RemainingCleanup;
	readonly deletedLocalBranches: ReadonlySet<string> | readonly string[];
}

function snapshotMergeLoopObservations(
	landed: readonly LandedPullRequest[],
	source: MergeLoopObservationSource,
	stackReconciliation: ObservedStackReconciliation,
): MergeLoopObservations {
	return {
		landed: [...landed],
		warnings: [...source.warnings],
		cleanup: { retainedLocalBranches: [...source.cleanup.retainedLocalBranches] },
		deletedLocalBranches: [...source.deletedLocalBranches],
		stackReconciliation,
	};
}

function mergeLoopFailure(
	failure: LandingFailure,
	landed: readonly LandedPullRequest[],
	state: MergeLoopState,
	stackReconciliation: ObservedStackReconciliation,
	failedPhase: LandingPhase = "merge",
): MergeLoopResult {
	return {
		type: "failure",
		observations: snapshotMergeLoopObservations(
			landed,
			{
				warnings: state.warnings,
				cleanup: state.cleanup,
				deletedLocalBranches: state.deletedBranches,
			},
			stackReconciliation,
		),
		failure,
		failedPhase,
	};
}

function stackMergeRejectedFailure(
	landFailureValue: LandingFailure,
	pr: PullRequestFacts,
	branch: string,
): LandingFailure {
	const { displayCommand, execResult } = boundaryFailureDiagnostics(landFailureValue);
	return landingExecutionFailure("Merge rejected; stopping stack landing immediately.", {
		...(execResult === undefined
			? {}
			: {
					...optionalEntry("displayCommand", displayCommand),
					execResult,
				}),
		failedBranch: branch,
		failedPrNumber: pr.number,
		suggestedAction: `Inspect PR #${pr.number}, resolve the merge rejection, then rerun /ns:flow:land from the desired branch.`,
	});
}
