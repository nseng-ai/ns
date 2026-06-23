export interface LatestCommitAutobranchArgs {
  slug?: string;
}

export type LatestCommitAutobranchResult =
  | { ok: true; summary: string; warnings: string[] }
  | { ok: false; error: string };

export type UpstreamHeadState =
  | { type: "no_upstream" }
  | { type: "upstream_contains_head"; upstream: string }
  | { type: "head_not_in_upstream"; upstream: string }
  | { type: "failed"; error: string };

export interface LatestCommitFacts {
  sourceBranch: string;
  trunkBranch: string;
  originalHeadSha: string;
  parentSha: string;
  commitMessage: string;
  commitDiff: string;
  commitSummary: string;
  upstream?: string;
}

export interface LatestCommitAutobranchPlan extends LatestCommitFacts {
  branchName: string;
  baseSlug: string;
  hasSuffix: boolean;
  slugSource: "requested" | "model";
}

export type LatestCommitInspectionPhase =
  | "trunk_lookup"
  | "upstream_check"
  | "child_branch_check"
  | "commit_parent_lookup"
  | "commit_evidence";

export type LatestCommitRefusal =
  | { reason: "trunk_branch"; branch: string }
  | { reason: "pushed_head"; upstream: string }
  | { reason: "child_branches"; children: string[] }
  | { reason: "root_commit"; headSha: string }
  | { reason: "merge_commit"; headSha: string; parentCount: number };

export type LatestCommitPreparationResult =
  | { ok: true; plan: LatestCommitAutobranchPlan }
  | { ok: false; kind: "inspect_failed"; phase: LatestCommitInspectionPhase; error: string }
  | ({ ok: false; kind: "refusal" } & LatestCommitRefusal)
  | { ok: false; kind: "invalid_requested_slug"; requestedSlug: string }
  | { ok: false; kind: "slug_generation_failed"; error: string }
  | { ok: false; kind: "branch_name_unavailable"; baseSlug: string };

export type CreatedBranchRecovery =
  | { restored: true; createdBranchDeleted: true }
  | { restored: true; createdBranchDeleted: false; createdBranchDeleteError: string }
  | {
      restored: false;
      restoreError: string;
      createdBranchDeleted: false;
      createdBranchDeleteError: string;
    };

export type SourceResetFailureRecovery =
  | { backupCleanup: "deleted" }
  | { backupCleanup: "delete_failed"; backupDeleteError: string }
  | { backupCleanup: "recovery_required"; recoveryCommand: string };

export type TransactionPreflightFailure =
  | { reason: "upstream_check_failed"; error: string }
  | { reason: "pushed_head"; upstream: string }
  | { reason: "backup_branch_name_unavailable"; sourceBranch: string }
  | { reason: "backup_create_failed"; error: string };

export type PostSourceResetStage = "graphite_create" | "branch_reset" | "head_verify";

export type LatestCommitTransactionResult =
  | {
      ok: true;
      commitSummary: string;
      backupCleanupWarning?: { backupBranch: string; backupDeleteError: string };
    }
  | ({ ok: false; kind: "preflight_failed" } & TransactionPreflightFailure)
  | ({
      ok: false;
      kind: "source_reset_failed";
      backupBranch: string;
      error: string;
    } & SourceResetFailureRecovery)
  | ({
      ok: false;
      kind: "post_source_reset_failed";
      stage: PostSourceResetStage;
      backupBranch: string;
      branchName: string;
      stageError?: string;
      actualHead?: string;
    } & CreatedBranchRecovery);
