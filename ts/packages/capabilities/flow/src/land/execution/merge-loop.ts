import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { validateStrictMergeGate } from "../preflight.ts";
import { landFailure, landingExecutionFailure, landSuccess } from "../results.ts";
import {
	boundaryFailureDiagnostics,
	type LandContext,
	type LandedPullRequest,
	type LandingFailure,
	type LandingPlan,
	type LandingWarning,
	type LandResult,
	type PullRequestFacts,
	type RetainedLocalBranchCleanup,
} from "../types.ts";
import type { LandExecutionProgress, LandExecutionStep } from "./host-seams.ts";
import { performGraphiteMaintenance } from "./maintenance.ts";
import { planGraphiteMaintenanceTargets, type MaintenanceMode } from "./maintenance-plan.ts";

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

/** Observed descendant-maintenance outcome; never inferred from plan shape alone. */
export type ObservedDescendantMaintenance =
	| { readonly type: "not-attempted" }
	| { readonly type: "completed" }
	| { readonly type: "skipped"; readonly reason: string };

export interface MergeLoopValue {
	readonly landed: readonly LandedPullRequest[];
	readonly warnings: readonly LandingWarning[];
	readonly cleanup: RemainingCleanup;
	readonly deletedLocalBranches: readonly string[];
	readonly descendantMaintenance: ObservedDescendantMaintenance;
}

export type MergeLoopResult =
	| { readonly type: "success"; readonly value: MergeLoopValue }
	| {
			readonly type: "failure";
			readonly failure: LandingFailure;
			readonly landed: readonly LandedPullRequest[];
			readonly warnings: readonly LandingWarning[];
			readonly cleanup: RemainingCleanup;
			readonly deletedLocalBranches: readonly string[];
			readonly descendantMaintenance: ObservedDescendantMaintenance;
	  };

export interface RunMergeLoopOptions {
	readonly context: LandContext;
	readonly progress: LandExecutionProgress;
	readonly plan: LandingPlan;
	readonly warnings: readonly LandingWarning[];
	readonly mergeState?: MergeLoopState;
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

export async function runMergeLoop(options: RunMergeLoopOptions): Promise<MergeLoopResult> {
	const { context, progress, plan } = options;
	const { repoRoot, stack } = plan;
	const landed: LandedPullRequest[] = [];
	let observedDescendantMaintenance: ObservedDescendantMaintenance = { type: "not-attempted" };
	let state = options.mergeState;
	if (state === undefined) {
		const preparedState = await prepareMergeLoopState({
			context,
			repoRoot,
			branches: [...stack.landingBranches, ...stack.descendantBranches],
			warnings: options.warnings,
		});
		if (preparedState.type === "failure") {
			return {
				...preparedState,
				landed,
				warnings: [...options.warnings],
				cleanup: { retainedLocalBranches: [] },
				deletedLocalBranches: [],
				descendantMaintenance: observedDescendantMaintenance,
			};
		}
		state = preparedState.value;
	}

	for (let index = 0; index < stack.landingBranches.length; index += 1) {
		const branch = stack.landingBranches[index];
		if (branch === undefined) continue;
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
			return mergeLoopFailure(gated.failure, landed, state, observedDescendantMaintenance);
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
			return mergeLoopFailure(merged.failure, landed, state, observedDescendantMaintenance);
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
				if (
					facts.value.state !== "MERGED" ||
					!facts.value.mergedAt ||
					facts.value.baseRefName !== stack.trunk ||
					facts.value.headRefName !== branch
				) {
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
			return mergeLoopFailure(verified.failure, landed, state, observedDescendantMaintenance);
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
		const maintenance = await performGraphiteMaintenance({
			landContext: context,
			progress,
			plan,
			step: { index, branch, prNumber: currentPr.number, state },
		});
		const observed = observeDescendantMaintenance(
			plan,
			planGraphiteMaintenanceTargets(plan, index).mode,
			maintenance.kind,
		);
		if (observed !== undefined) observedDescendantMaintenance = observed;
		if (maintenance.kind === "halt") {
			progress.setStep(branch, "restack", "failed");
			return mergeLoopFailure(maintenance.failure, landed, state, observedDescendantMaintenance);
		}
		if (maintenance.kind === "skip") {
			progress.setStep(branch, "restack", "skipped");
			if (maintenance.warning !== undefined) state.warnings.push(maintenance.warning);
		} else {
			progress.setStep(branch, "restack", "done");
		}
	}
	return {
		type: "success",
		value: {
			landed,
			warnings: [...state.warnings],
			cleanup: { retainedLocalBranches: [...state.cleanup.retainedLocalBranches] },
			deletedLocalBranches: [...state.deletedBranches],
			descendantMaintenance: observedDescendantMaintenance,
		},
	};
}

function observeDescendantMaintenance(
	plan: LandingPlan,
	mode: MaintenanceMode,
	kind: "proceed" | "skip" | "halt",
): ObservedDescendantMaintenance | undefined {
	switch (mode) {
		case "required-next-landing":
			return undefined;
		case "none":
			return { type: "skipped", reason: "no descendant branches require maintenance" };
		case "skip-descendant":
			return {
				type: "skipped",
				reason:
					plan.descendantMaintenance.type === "skipped"
						? plan.descendantMaintenance.reason
						: "descendant maintenance was skipped",
			};
		case "optional-descendants":
			return kind === "proceed"
				? { type: "completed" }
				: { type: "skipped", reason: "optional descendant maintenance did not complete" };
	}
}

function mergeLoopFailure(
	failure: LandingFailure,
	landed: readonly LandedPullRequest[],
	state: MergeLoopState,
	descendantMaintenance: ObservedDescendantMaintenance,
): MergeLoopResult {
	return {
		type: "failure",
		failure,
		landed: [...landed],
		warnings: [...state.warnings],
		cleanup: { retainedLocalBranches: [...state.cleanup.retainedLocalBranches] },
		deletedLocalBranches: [...state.deletedBranches],
		descendantMaintenance,
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
