import type { SdlExtensionApi } from "@sdl/sdl/sdk";

import { branchNameCandidates, findAvailableBranchName } from "../branch-availability.ts";
import { normalizeBranchSlugText, stripPlanSuffix } from "../branch-slug-text.ts";
import { execGt, GIT_FACT_TIMEOUT_MS } from "../command-exec.ts";
import { execGit, formatCommandDetails } from "../worktree.ts";
import { inspectUpstreamHeadState } from "./git.ts";
import type {
  CreatedBranchRecovery,
  LatestCommitAutobranchPlan,
  LatestCommitTransactionResult,
  SourceResetFailureRecovery,
} from "./types.ts";

const MAX_BACKUP_SEGMENT_CHARS = 32;

export async function runLatestCommitAutobranchTransaction(
  ctx: SdlExtensionApi,
  plan: LatestCommitAutobranchPlan,
): Promise<LatestCommitTransactionResult> {
  const upstream = await inspectUpstreamHeadState(ctx);
  if (upstream.type === "failed") {
    return {
      ok: false,
      kind: "preflight_failed",
      reason: "upstream_check_failed",
      error: upstream.error,
    };
  }
  if (upstream.type === "upstream_contains_head") {
    return {
      ok: false,
      kind: "preflight_failed",
      reason: "pushed_head",
      upstream: upstream.upstream,
    };
  }

  const backupBranch = await chooseAvailableBackupBranchName(ctx, plan.sourceBranch, Date.now());
  if (!backupBranch.ok) {
    return {
      ok: false,
      kind: "preflight_failed",
      reason: "backup_branch_name_unavailable",
      sourceBranch: plan.sourceBranch,
    };
  }

  const backupCreated = await execGit(
    ctx,
    ["branch", backupBranch.name, plan.originalHeadSha],
    GIT_FACT_TIMEOUT_MS,
  );
  if (backupCreated.code !== 0) {
    return {
      ok: false,
      kind: "preflight_failed",
      reason: "backup_create_failed",
      error: formatCommandDetails(backupCreated),
    };
  }

  const resetSource = await resetSourceBranchToParent(ctx, plan);
  if (!resetSource.ok) {
    return {
      ok: false,
      kind: "source_reset_failed",
      backupBranch: backupBranch.name,
      error: resetSource.error,
      ...(await recoverFromSourceResetFailure(ctx, plan, backupBranch.name)),
    };
  }

  const created = await execGt(ctx, ["create", plan.branchName, "--no-interactive", "--no-ai"]);
  if (created.code !== 0) {
    const recovery = await restoreSourceAndDeleteCreatedBranch(ctx, plan);
    return {
      ok: false,
      kind: "post_source_reset_failed",
      stage: "graphite_create",
      backupBranch: backupBranch.name,
      branchName: plan.branchName,
      stageError: formatCommandDetails(created),
      ...recovery,
    };
  }

  const resetBranch = await execGit(
    ctx,
    ["reset", "--hard", plan.originalHeadSha],
    GIT_FACT_TIMEOUT_MS,
  );
  if (resetBranch.code !== 0) {
    const recovery = await restoreSourceAndDeleteCreatedBranch(ctx, plan);
    return {
      ok: false,
      kind: "post_source_reset_failed",
      stage: "branch_reset",
      backupBranch: backupBranch.name,
      branchName: plan.branchName,
      stageError: formatCommandDetails(resetBranch),
      ...recovery,
    };
  }

  const verified = await execGit(ctx, ["rev-parse", "HEAD"], GIT_FACT_TIMEOUT_MS);
  const actualHead = verified.stdout.trim();
  if (verified.code !== 0 || actualHead !== plan.originalHeadSha) {
    const recovery = await restoreSourceAndDeleteCreatedBranch(ctx, plan);
    return {
      ok: false,
      kind: "post_source_reset_failed",
      stage: "head_verify",
      backupBranch: backupBranch.name,
      branchName: plan.branchName,
      actualHead: actualHead.length > 0 ? actualHead : formatCommandDetails(verified),
      ...recovery,
    };
  }

  const deleted = await execGit(ctx, ["branch", "-D", backupBranch.name], GIT_FACT_TIMEOUT_MS);
  if (deleted.code !== 0) {
    return {
      ok: true,
      commitSummary: plan.commitSummary,
      backupCleanupWarning: {
        backupBranch: backupBranch.name,
        backupDeleteError: formatCommandDetails(deleted),
      },
    };
  }
  return { ok: true, commitSummary: plan.commitSummary };
}

async function resetSourceBranchToParent(
  ctx: SdlExtensionApi,
  plan: LatestCommitAutobranchPlan,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const currentBranch = await execGit(ctx, ["branch", "--show-current"], GIT_FACT_TIMEOUT_MS);
  if (currentBranch.code !== 0) {
    return { ok: false, error: formatCommandDetails(currentBranch) };
  }
  if (currentBranch.stdout.trim() !== plan.sourceBranch) {
    return {
      ok: false,
      error: `Expected to be on ${plan.sourceBranch}, but current branch is ${currentBranch.stdout.trim().length > 0 ? currentBranch.stdout.trim() : "(detached)"}.`,
    };
  }

  const currentHead = await execGit(ctx, ["rev-parse", "HEAD"], GIT_FACT_TIMEOUT_MS);
  if (currentHead.code !== 0) {
    return { ok: false, error: formatCommandDetails(currentHead) };
  }
  if (currentHead.stdout.trim() !== plan.originalHeadSha) {
    return {
      ok: false,
      error: `Expected HEAD ${plan.originalHeadSha}, but found ${currentHead.stdout.trim()}.`,
    };
  }

  const reset = await execGit(ctx, ["reset", "--hard", plan.parentSha], GIT_FACT_TIMEOUT_MS);
  if (reset.code !== 0) {
    return { ok: false, error: formatCommandDetails(reset) };
  }
  return { ok: true };
}

async function recoverFromSourceResetFailure(
  ctx: SdlExtensionApi,
  plan: LatestCommitAutobranchPlan,
  backupBranch: string,
): Promise<SourceResetFailureRecovery> {
  const [currentBranch, currentHead] = await Promise.all([
    execGit(ctx, ["branch", "--show-current"], GIT_FACT_TIMEOUT_MS),
    execGit(ctx, ["rev-parse", "HEAD"], GIT_FACT_TIMEOUT_MS),
  ]);
  const isSourceUnchanged =
    currentBranch.code === 0 &&
    currentHead.code === 0 &&
    currentBranch.stdout.trim() === plan.sourceBranch &&
    currentHead.stdout.trim() === plan.originalHeadSha;
  if (isSourceUnchanged) {
    const deleted = await execGit(ctx, ["branch", "-D", backupBranch], GIT_FACT_TIMEOUT_MS);
    if (deleted.code === 0) {
      return { backupCleanup: "deleted" };
    }
    return { backupCleanup: "delete_failed", backupDeleteError: formatCommandDetails(deleted) };
  }

  return {
    backupCleanup: "recovery_required",
    recoveryCommand: `git checkout ${plan.sourceBranch} && git reset --hard ${backupBranch}`,
  };
}

async function restoreSourceBranch(
  ctx: SdlExtensionApi,
  plan: LatestCommitAutobranchPlan,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const checkedOut = await execGit(ctx, ["checkout", plan.sourceBranch], GIT_FACT_TIMEOUT_MS);
  if (checkedOut.code !== 0) {
    return { ok: false, error: formatCommandDetails(checkedOut) };
  }
  const restored = await execGit(
    ctx,
    ["reset", "--hard", plan.originalHeadSha],
    GIT_FACT_TIMEOUT_MS,
  );
  if (restored.code !== 0) {
    return { ok: false, error: formatCommandDetails(restored) };
  }
  return { ok: true };
}

async function restoreSourceAndDeleteCreatedBranch(
  ctx: SdlExtensionApi,
  plan: LatestCommitAutobranchPlan,
): Promise<CreatedBranchRecovery> {
  const restored = await restoreSourceBranch(ctx, plan);
  if (!restored.ok) {
    return {
      restored: false,
      restoreError: restored.error,
      createdBranchDeleted: false,
      createdBranchDeleteError: `Skipped deleting incomplete branch ${plan.branchName} because source branch restoration failed.`,
    };
  }

  const deleted = await execGit(ctx, ["branch", "-D", plan.branchName], GIT_FACT_TIMEOUT_MS);
  if (deleted.code !== 0) {
    return {
      restored: true,
      createdBranchDeleted: false,
      createdBranchDeleteError: formatCommandDetails(deleted),
    };
  }
  return { restored: true, createdBranchDeleted: true };
}

async function chooseAvailableBackupBranchName(
  ctx: SdlExtensionApi,
  sourceBranch: string,
  timestamp: number,
): Promise<{ ok: true; name: string } | { ok: false }> {
  const normalizedSource = sourceBranch
    .split("/")
    .map((segment) => sanitizeBackupBranchSegment(segment))
    .filter((segment) => segment.length > 0)
    .join("/");
  const sanitizedSource = normalizedSource.length > 0 ? normalizedSource : "branch";
  const base = `autobranch-backup/${sanitizedSource}/${timestamp}`;
  const available = await findAvailableBranchName(
    ctx,
    branchNameCandidates((_, suffix) => `${base}${suffix}`),
  );
  if (!available) {
    return { ok: false };
  }
  return { ok: true, name: available.name };
}

function sanitizeBackupBranchSegment(value: string): string {
  const withoutPlanSuffix = stripPlanSuffix(normalizeBranchSlugText(value)).replace(/-+$/g, "");
  return stripPlanSuffix(withoutPlanSuffix.slice(0, MAX_BACKUP_SEGMENT_CHARS)).replace(/-+$/g, "");
}
