import { shortSha } from "../branch-slug-text.ts";
import type {
  CreatedBranchRecovery,
  LatestCommitPreparationResult,
  LatestCommitTransactionResult,
  SourceResetFailureRecovery,
} from "./types.ts";

export function formatLatestCommitPreparationFailure(
  result: Extract<LatestCommitPreparationResult, { ok: false }>,
): string {
  switch (result.kind) {
    case "inspect_failed":
      return formatInspectFailure(result);
    case "refusal":
      return formatRefusal(result);
    case "invalid_requested_slug":
      return `Invalid branch slug: ${result.requestedSlug}`;
    case "slug_generation_failed":
      return result.error;
    case "branch_name_unavailable":
      return `Could not find an available branch name based on ${result.baseSlug}.`;
  }
}

function formatInspectFailure(
  result: Extract<LatestCommitPreparationResult, { kind: "inspect_failed" }>,
): string {
  switch (result.phase) {
    case "trunk_lookup":
      return `Could not resolve Graphite trunk; refusing to move latest commit.\n${result.error}`;
    case "upstream_check":
      return `Could not determine whether HEAD is already in the current branch upstream.\n${result.error}`;
    case "child_branch_check":
      return `Could not inspect Graphite child branches before moving the latest commit.\n${result.error}`;
    case "commit_parent_lookup":
      return `Could not inspect latest commit parents.\n${result.error}`;
    case "commit_evidence":
      return `Could not read latest commit evidence for branch slug generation.\n${result.error}`;
  }
}

function formatRefusal(
  result: Extract<LatestCommitPreparationResult, { kind: "refusal" }>,
): string {
  switch (result.reason) {
    case "trunk_branch":
      return `Refusing to move latest commit from Graphite trunk branch ${result.branch}.`;
    case "pushed_head":
      return `Refusing to move latest commit because upstream ${result.upstream} already contains HEAD.`;
    case "child_branches":
      return [
        "Refusing to move latest commit because the source branch has Graphite child branches.",
        "Move or restack child branches first:",
        ...result.children.map((child) => `- ${child}`),
      ].join("\n");
    case "root_commit":
      return `Refusing to move root commit ${shortSha(result.headSha)}; latest-commit autobranch requires a single-parent commit.`;
    case "merge_commit":
      return `Refusing to move merge commit ${shortSha(result.headSha)} with ${result.parentCount} parents; latest-commit autobranch supports only single-parent commits.`;
  }
}

export function formatLatestCommitTransactionFailure(
  result: Extract<LatestCommitTransactionResult, { ok: false }>,
): string {
  switch (result.kind) {
    case "preflight_failed":
      return formatPreflightFailure(result);
    case "source_reset_failed":
      return [
        "Failed to reset source branch before Graphite branch creation.",
        `Recovery branch: ${result.backupBranch}`,
        result.error,
        formatSourceResetCleanup(result),
      ].join("\n");
    case "post_source_reset_failed":
      return formatPostSourceResetFailure(result);
  }
}

function formatPreflightFailure(
  result: Extract<LatestCommitTransactionResult, { kind: "preflight_failed" }>,
): string {
  switch (result.reason) {
    case "backup_branch_name_unavailable":
      return `Could not find an available recovery branch name for ${result.sourceBranch}; refusing to move latest commit.`;
    case "backup_create_failed":
      return ["Failed to create recovery branch before moving latest commit.", result.error].join(
        "\n",
      );
    case "upstream_check_failed":
      return `Could not re-check whether HEAD is already in the current branch upstream before moving the latest commit.\n${result.error}`;
    case "pushed_head":
      return `Refusing to move latest commit because upstream ${result.upstream} now contains HEAD.`;
  }
}

function formatPostSourceResetFailure(
  result: Extract<LatestCommitTransactionResult, { kind: "post_source_reset_failed" }>,
): string {
  switch (result.stage) {
    case "graphite_create":
      return [
        "Failed to create Graphite branch after resetting source branch.",
        `Recovery branch: ${result.backupBranch}`,
        result.stageError ?? "Graphite branch creation failed without command details.",
        result.restored
          ? "Restored source branch to the original HEAD."
          : `Could not restore source branch: ${result.restoreError}`,
        formatCreatedBranchCleanup(result),
      ].join("\n");
    case "branch_reset":
      return [
        `Created Graphite branch ${result.branchName}, but failed to move it to the original commit.`,
        `Recovery branch: ${result.backupBranch}`,
        result.stageError ?? "Branch reset failed without command details.",
        result.restored
          ? "Restored source branch to the original HEAD."
          : `Could not restore source branch: ${result.restoreError}`,
        formatCreatedBranchCleanup(result),
      ].join("\n");
    case "head_verify":
      return [
        `Created Graphite branch ${result.branchName}, but HEAD verification failed after moving it.`,
        `Expected original commit, found: ${result.actualHead ?? "(unknown)"}`,
        `Recovery branch: ${result.backupBranch}`,
        result.restored
          ? "Restored source branch to the original HEAD."
          : `Could not restore source branch: ${result.restoreError}`,
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

function formatCreatedBranchCleanup(
  result: CreatedBranchRecovery & { branchName: string },
): string {
  if (result.createdBranchDeleted) {
    return `Deleted incomplete branch ${result.branchName}.`;
  }
  return `Could not delete incomplete branch ${result.branchName}: ${result.createdBranchDeleteError}`;
}
