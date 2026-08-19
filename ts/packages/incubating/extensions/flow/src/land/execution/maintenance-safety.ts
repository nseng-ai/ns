import type { ExecResult } from "@nseng-ai/foundation/command";
import { shortSha } from "../../commit-display/index.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "../graphite-operations.ts";
import { landingExecutionFailure } from "../results.ts";
import type { LandingExecutionFailure } from "../types.ts";
import type { LandExecutionContext } from "./execution-context.ts";

export async function repairGraphiteBranchParent(
	executionContext: LandExecutionContext,
	options: {
		readonly repoRoot: string;
		readonly prNumber: number;
		readonly branch: string;
		readonly parent: string;
		readonly failureSubject: string;
	},
): Promise<LandingExecutionFailure | undefined> {
	const { land: landContext, progress } = executionContext;
	progress.setStatus(`repairing Graphite topology for ${options.branch}...`);
	const reparented = await landContext.graphite.reparentBranch({
		repoRoot: options.repoRoot,
		branch: options.branch,
		parent: options.parent,
	});
	if (reparented.type === "success") return undefined;

	return landingExecutionFailure(
		`PR #${options.prNumber} merged, but Graphite topology repair failed for ${options.failureSubject}.`,
		{
			displayCommand: reparented.commandDisplay,
			execResult: reparented.result,
			failedBranch: options.branch,
			suggestedAction: `Run ${reparented.commandDisplay} manually, inspect the stack, then rerun /ns:flow:gt:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
		},
	);
}

export async function guardForcedRefresh(
	executionContext: LandExecutionContext,
	options: {
		readonly repoRoot: string;
		readonly prNumber: number;
		readonly branch: string;
		readonly expectedSha: string | undefined;
	},
): Promise<LandingExecutionFailure | undefined> {
	const guardSha = await executionContext.land.git.localBranchSha({
		repoRoot: options.repoRoot,
		branch: options.branch,
	});
	if (guardSha.type === "failure") {
		return landingExecutionFailure(
			`PR #${options.prNumber} merged, but could not verify local branch ${options.branch} before refreshing it.\n${guardSha.failure.message}`,
			{
				failedBranch: options.branch,
				suggestedAction: `Inspect local branch ${options.branch}, then rerun /ns:flow:gt:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
			},
		);
	}
	if (options.expectedSha === guardSha.value) return undefined;

	const expectedDisplay =
		options.expectedSha === undefined ? "(unrecorded)" : shortSha(options.expectedSha);
	return landingExecutionFailure(
		`PR #${options.prNumber} merged, but local branch ${options.branch} moved from ${expectedDisplay} to ${shortSha(guardSha.value)} since landing started; refusing gt get --force to avoid clobbering local commits.`,
		{
			failedBranch: options.branch,
			suggestedAction: `Inspect local branch ${options.branch}, reconcile it with the remote, then rerun /ns:flow:gt:land if appropriate. ${LAND_BACKUP_RECOVERY_HINT}`,
		},
	);
}

export interface BranchPreDeleteCheckFailureDetails {
	readonly branch: string;
	readonly prNumber: number;
	readonly failureMessage: string;
	readonly warningMessage: string;
	readonly suggestedAction: string;
}

export async function checkBranchBeforeDelete(
	executionContext: LandExecutionContext,
	options: {
		readonly repoRoot: string;
		readonly metadataDbPath: string;
		readonly prNumber: number;
		readonly branch: string;
		readonly allowedChildren: ReadonlySet<string>;
	},
): Promise<BranchPreDeleteCheckFailureDetails | undefined> {
	const children = await executionContext.land.graphite.branchChildren({
		repoRoot: options.repoRoot,
		metadataDbPath: options.metadataDbPath,
		branch: options.branch,
	});
	if (children.type === "failure") {
		return {
			branch: options.branch,
			prNumber: options.prNumber,
			failureMessage: `PR #${options.prNumber} merged, but the pre-delete Graphite children re-check for ${options.branch} failed; refusing gt delete without an authoritative child list.\n${children.failure.message}`,
			warningMessage: `All target PRs were merged, but the pre-delete Graphite children re-check for ${options.branch} failed; local branch ${options.branch} cleanup was skipped.\n${children.failure.message}`,
			suggestedAction: `Inspect the stack, then delete local branch ${options.branch} manually when safe. ${LAND_BACKUP_RECOVERY_HINT}`,
		};
	}
	const unexpectedChildren = children.value.filter((child) => !options.allowedChildren.has(child));
	if (unexpectedChildren.length === 0) return undefined;
	return {
		branch: options.branch,
		prNumber: options.prNumber,
		failureMessage: `PR #${options.prNumber} merged, but ${options.branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); refusing gt delete to avoid destroying another stack.`,
		warningMessage: `All target PRs were merged, but ${options.branch} now has unexpected Graphite children (${unexpectedChildren.join(", ")}); local branch ${options.branch} cleanup was skipped.`,
		suggestedAction: `Inspect the unexpected children, land or move them, then clean up local branch ${options.branch} manually before rerunning /ns:flow:gt:land. ${LAND_BACKUP_RECOVERY_HINT}`,
	};
}

export function branchPreDeleteCheckFailure(
	details: BranchPreDeleteCheckFailureDetails,
): LandingExecutionFailure {
	return landingExecutionFailure(details.failureMessage, {
		failedBranch: details.branch,
		failedPrNumber: details.prNumber,
		suggestedAction: details.suggestedAction,
	});
}

export interface LocalBranchDeletionFailureOptions {
	readonly branch: string;
	readonly prNumber: number;
	readonly commandDisplay: string;
	readonly result: ExecResult;
	readonly isLikelyInProgressGitOperation: boolean;
}

export function localBranchDeletionFailure(
	options: LocalBranchDeletionFailureOptions,
): LandingExecutionFailure {
	const details = localBranchDeletionFailureDetails(options);
	return landingExecutionFailure(details.failureMessage, {
		displayCommand: options.commandDisplay,
		execResult: options.result,
		failedBranch: options.branch,
		failedPrNumber: options.prNumber,
		suggestedAction: details.failureSuggestedAction,
	});
}

export function localBranchDeletionFailureDetails(
	options: Pick<
		LocalBranchDeletionFailureOptions,
		"branch" | "prNumber" | "isLikelyInProgressGitOperation"
	>,
): {
	readonly failureMessage: string;
	readonly failureSuggestedAction: string;
	readonly warningMessage: string;
	readonly warningSuggestedAction: string;
} {
	if (!options.isLikelyInProgressGitOperation) {
		return {
			failureMessage: `PR #${options.prNumber} merged, but deleting the local Graphite branch ${options.branch} failed.`,
			failureSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack before rerunning /ns:flow:gt:land.`,
			warningMessage: `All target PRs were merged, but deleting the local Graphite branch ${options.branch} failed.`,
			warningSuggestedAction: `Delete or repair local Graphite branch ${options.branch} manually, then inspect the stack.`,
		};
	}

	const operationMessage = `Graphite cleanup for local branch ${options.branch} stopped during branch deletion with an in-progress Git operation or conflicts. The repository may now be mid-rebase; do not rerun /ns:flow:gt:land until it is resolved or aborted.`;
	const suggestedAction = `Run git status. Resolve the conflicts and continue the Git operation, or run git rebase --abort if you want to back out of the cleanup restack; then inspect the stack and delete or repair local Graphite branch ${options.branch} manually before rerunning /ns:flow:gt:land.`;
	return {
		failureMessage: `PR #${options.prNumber} merged, but ${operationMessage}`,
		failureSuggestedAction: suggestedAction,
		warningMessage: `All target PRs were merged, but ${operationMessage}`,
		warningSuggestedAction: suggestedAction,
	};
}
