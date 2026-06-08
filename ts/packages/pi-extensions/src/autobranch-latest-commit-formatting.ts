import { shortSha } from "./land-stack/command-exec.ts";
import type { LatestCommitPreparationResult } from "./autobranch-latest-commit-preparation.ts";
import type { CreatedBranchRecovery, LatestCommitTransactionResult, SourceResetFailureRecovery } from "./autobranch-latest-commit-transaction.ts";

export function formatLatestCommitPreparationFailure(result: Extract<LatestCommitPreparationResult, { ok: false }>): string {
	switch (result.kind) {
		case "trunk_lookup_failed":
			return `Could not resolve Graphite trunk; refusing to move latest commit.\n${result.error}`;
		case "trunk_refusal":
			return `Refusing to move latest commit from Graphite trunk branch ${result.branch}.`;
		case "upstream_check_failed":
			return `Could not determine whether HEAD is already in the current branch upstream.\n${result.error}`;
		case "pushed_head_refusal":
			return `Refusing to move latest commit because upstream ${result.upstream} already contains HEAD.`;
		case "child_branch_check_failed":
			return `Could not inspect Graphite child branches before moving the latest commit.\n${result.error}`;
		case "child_branch_refusal":
			return [
				"Refusing to move latest commit because the source branch has Graphite child branches.",
				"Move or restack child branches first:",
				...result.children.map((child) => `- ${child}`),
			].join("\n");
		case "commit_parent_lookup_failed":
			return `Could not inspect latest commit parents.\n${result.error}`;
		case "root_commit_refusal":
			return `Refusing to move root commit ${shortSha(result.headSha)}; latest-commit autobranch requires a single-parent commit.`;
		case "merge_commit_refusal":
			return `Refusing to move merge commit ${shortSha(result.headSha)} with ${result.parentCount} parents; latest-commit autobranch supports only single-parent commits.`;
		case "commit_evidence_failed":
			return `Could not read latest commit evidence for branch slug generation.\n${result.error}`;
		case "invalid_requested_slug":
			return `Invalid branch slug: ${result.requestedSlug}`;
		case "slug_generation_failed":
			return result.error;
		case "branch_name_unavailable":
			return `Could not find an available branch name based on ${result.baseSlug}.`;
	}
}

export function formatLatestCommitTransactionFailure(result: Extract<LatestCommitTransactionResult, { ok: false }>): string {
	switch (result.kind) {
		case "backup_branch_name_unavailable":
			return `Could not find an available recovery branch name for ${result.sourceBranch}; refusing to move latest commit.`;
		case "backup_create_failed":
			return ["Failed to create recovery branch before moving latest commit.", result.error].join("\n");
		case "source_reset_failed":
			return ["Failed to reset source branch before Graphite branch creation.", `Recovery branch: ${result.backupBranch}`, result.error, formatSourceResetCleanup(result)].join("\n");
		case "graphite_create_failed":
			return [
				"Failed to create Graphite branch after resetting source branch.",
				`Recovery branch: ${result.backupBranch}`,
				result.createError,
				result.restored ? "Restored source branch to the original HEAD." : `Could not restore source branch: ${result.restoreError}`,
				formatCreatedBranchCleanup(result),
			].join("\n");
		case "transaction_upstream_check_failed":
			return `Could not re-check whether HEAD is already in the current branch upstream before moving the latest commit.\n${result.error}`;
		case "pushed_head_refusal":
			return `Refusing to move latest commit because upstream ${result.upstream} now contains HEAD.`;
		case "branch_reset_failed":
			return [
				`Created Graphite branch ${result.branchName}, but failed to move it to the original commit.`,
				`Recovery branch: ${result.backupBranch}`,
				result.resetError,
				result.restored ? "Restored source branch to the original HEAD." : `Could not restore source branch: ${result.restoreError}`,
				formatCreatedBranchCleanup(result),
			].join("\n");
		case "head_verify_failed":
			return [
				`Created Graphite branch ${result.branchName}, but HEAD verification failed after moving it.`,
				`Expected original commit, found: ${result.actualHead}`,
				`Recovery branch: ${result.backupBranch}`,
				result.restored ? "Restored source branch to the original HEAD." : `Could not restore source branch: ${result.restoreError}`,
				formatCreatedBranchCleanup(result),
			].join("\n");
	}
}

function formatSourceResetCleanup(result: SourceResetFailureRecovery): string {
	switch (result.backupCleanup) {
		case "deleted":
			return "Deleted redundant recovery branch because the source branch is still at the original commit.";
		case "delete_failed":
			return `Could not delete redundant recovery branch: ${result.backupDeleteError}`;
		case "recovery_required":
			return `To restore the source branch to the saved commit, run: ${result.recoveryCommand}`;
	}
}

export function formatCreatedBranchCleanup(result: CreatedBranchRecovery & { branchName: string }): string {
	if (result.createdBranchDeleted) {
		return `Deleted incomplete branch ${result.branchName}.`;
	}
	return `Could not delete incomplete branch ${result.branchName}: ${result.createdBranchDeleteError}`;
}
