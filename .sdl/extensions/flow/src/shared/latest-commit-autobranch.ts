import type { SdlExtensionApi } from "@sdl/sdl/sdk";

import { shortSha } from "./branch-slug-text.ts";
import { GIT_FACT_TIMEOUT_MS } from "./command-exec.ts";
import { execGit, type PendingWorktreeSnapshot } from "./worktree.ts";
import {
  formatLatestCommitPreparationFailure,
  formatLatestCommitTransactionFailure,
} from "./latest-commit/format.ts";
import { prepareLatestCommitAutobranchPlan } from "./latest-commit/plan.ts";
import { runLatestCommitAutobranchTransaction } from "./latest-commit/transaction.ts";
import type {
  LatestCommitAutobranchArgs,
  LatestCommitAutobranchResult,
} from "./latest-commit/types.ts";

export type {
  LatestCommitAutobranchArgs,
  LatestCommitAutobranchResult,
} from "./latest-commit/types.ts";

export async function createLatestCommitAutobranchFlow(
  ctx: SdlExtensionApi,
  args: LatestCommitAutobranchArgs,
  snapshot: PendingWorktreeSnapshot,
): Promise<LatestCommitAutobranchResult> {
  const prepared = await prepareLatestCommitAutobranchPlan(ctx, args, snapshot);
  if (!prepared.ok) {
    return { ok: false, error: formatLatestCommitPreparationFailure(prepared) };
  }

  const transaction = await runLatestCommitAutobranchTransaction(ctx, prepared.plan);
  if (!transaction.ok) {
    return { ok: false, error: formatLatestCommitTransactionFailure(transaction) };
  }

  const cleanliness = await execGit(ctx, ["status", "--porcelain=v1"], GIT_FACT_TIMEOUT_MS);
  const isClean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
  const suffix = prepared.plan.hasSuffix
    ? ` (base slug ${prepared.plan.baseSlug} was unavailable)`
    : "";
  const warnings = transaction.backupCleanupWarning
    ? [
        `Warning: recovery branch ${transaction.backupCleanupWarning.backupBranch} could not be deleted: ${transaction.backupCleanupWarning.backupDeleteError}`,
      ]
    : [];

  return {
    ok: true,
    summary: [
      `New branch: ${prepared.plan.branchName}${suffix}`,
      `Moved commit: ${transaction.commitSummary}`,
      `Source branch ${prepared.plan.sourceBranch} reset to ${shortSha(prepared.plan.parentSha)}.`,
      isClean
        ? "Working directory is clean."
        : "Warning: working directory is not clean after latest-commit autobranch.",
    ].join("\n"),
    warnings,
  };
}
