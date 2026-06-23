import { formatCommandDetails, type ExecResult, type SdlExtensionApi } from "@sdl/sdl/sdk";

import {
  branchNameCandidates,
  buildBranchSlugPrompt,
  chooseAvailableBranchName,
  deriveBranchSlug,
  findAvailableBranchName,
  firstNonEmptyLine,
  MAX_DIFF_CHARS,
  nonEmptyLines,
  normalizeBranchSlugText,
  prepareRequestedBranchSlug,
  sanitizeBranchName,
  shortSha,
} from "./branch-slugs.ts";
import { execGit, type PendingWorktreeSnapshot } from "./worktree.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GT_TIMEOUT_MS = 120_000;
const MAX_BACKUP_SEGMENT_CHARS = 32;

export interface LatestCommitAutobranchArgs {
  slug?: string;
}

export type LatestCommitAutobranchResult =
  | { ok: true; summary: string; warnings: string[] }
  | { ok: false; error: string };

type UpstreamHeadState =
  | { type: "no_upstream" }
  | { type: "upstream_contains_head"; upstream: string }
  | { type: "head_not_in_upstream"; upstream: string }
  | { type: "failed"; error: string };

interface LatestCommitFacts {
  sourceBranch: string;
  trunkBranch: string;
  originalHeadSha: string;
  parentSha: string;
  commitMessage: string;
  commitDiff: string;
  commitSummary: string;
  upstream?: string;
}

interface LatestCommitAutobranchPlan extends LatestCommitFacts {
  branchName: string;
  baseSlug: string;
  hasSuffix: boolean;
  slugSource: "requested" | "model";
}

type LatestCommitPreparationResult =
  | { ok: true; plan: LatestCommitAutobranchPlan }
  | { ok: false; kind: "trunk_lookup_failed"; error: string }
  | { ok: false; kind: "trunk_refusal"; branch: string }
  | { ok: false; kind: "upstream_check_failed"; error: string }
  | { ok: false; kind: "pushed_head_refusal"; upstream: string }
  | { ok: false; kind: "child_branch_check_failed"; error: string }
  | { ok: false; kind: "child_branch_refusal"; children: string[] }
  | { ok: false; kind: "commit_parent_lookup_failed"; error: string }
  | { ok: false; kind: "root_commit_refusal"; headSha: string }
  | { ok: false; kind: "merge_commit_refusal"; headSha: string; parentCount: number }
  | { ok: false; kind: "commit_evidence_failed"; error: string }
  | { ok: false; kind: "invalid_requested_slug"; requestedSlug: string }
  | { ok: false; kind: "slug_generation_failed"; error: string }
  | { ok: false; kind: "branch_name_unavailable"; baseSlug: string };

type CreatedBranchRecovery =
  | { restored: true; createdBranchDeleted: true }
  | { restored: true; createdBranchDeleted: false; createdBranchDeleteError: string }
  | {
      restored: false;
      restoreError: string;
      createdBranchDeleted: false;
      createdBranchDeleteError: string;
    };

type SourceResetFailureRecovery =
  | { backupCleanup: "deleted" }
  | { backupCleanup: "delete_failed"; backupDeleteError: string }
  | { backupCleanup: "recovery_required"; recoveryCommand: string };

type LatestCommitTransactionResult =
  | { ok: true; commitSummary: string; backupDeleted: true }
  | {
      ok: true;
      commitSummary: string;
      backupDeleted: false;
      backupBranch: string;
      backupDeleteError: string;
    }
  | { ok: false; kind: "backup_branch_name_unavailable"; sourceBranch: string }
  | { ok: false; kind: "backup_create_failed"; error: string }
  | ({
      ok: false;
      kind: "source_reset_failed";
      backupBranch: string;
      error: string;
    } & SourceResetFailureRecovery)
  | ({
      ok: false;
      kind: "graphite_create_failed";
      backupBranch: string;
      branchName: string;
      createError: string;
    } & CreatedBranchRecovery)
  | { ok: false; kind: "transaction_upstream_check_failed"; error: string }
  | { ok: false; kind: "pushed_head_refusal"; upstream: string }
  | ({
      ok: false;
      kind: "branch_reset_failed";
      backupBranch: string;
      branchName: string;
      resetError: string;
    } & CreatedBranchRecovery)
  | ({
      ok: false;
      kind: "head_verify_failed";
      backupBranch: string;
      branchName: string;
      actualHead: string;
    } & CreatedBranchRecovery);

function execGt(
  ctx: SdlExtensionApi,
  args: readonly string[],
  timeoutMs: number,
): Promise<ExecResult> {
  return ctx.exec("gt", [...args], { timeoutMs });
}

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
  const warnings = transaction.backupDeleted
    ? []
    : [
        `Warning: recovery branch ${transaction.backupBranch} could not be deleted: ${transaction.backupDeleteError}`,
      ];

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

async function prepareLatestCommitAutobranchPlan(
  ctx: SdlExtensionApi,
  args: LatestCommitAutobranchArgs,
  snapshot: PendingWorktreeSnapshot,
): Promise<LatestCommitPreparationResult> {
  const requested = prepareRequestedBranchSlug(args.slug);
  if (requested.kind === "invalid_requested_slug") {
    return { ok: false, kind: "invalid_requested_slug", requestedSlug: requested.requestedSlug };
  }

  const facts = await loadLatestCommitFacts(ctx, snapshot);
  if (!facts.ok) return facts;

  const slug =
    requested.kind === "slug"
      ? { ok: true as const, baseSlug: requested.baseSlug, source: requested.source }
      : await prepareLatestCommitSlug(ctx, facts.facts);
  if (!slug.ok) return slug;

  const branchName = await chooseAvailableBranchName(ctx, slug.baseSlug);
  if (!branchName.ok) {
    return { ok: false, kind: "branch_name_unavailable", baseSlug: slug.baseSlug };
  }

  return {
    ok: true,
    plan: {
      ...facts.facts,
      branchName: branchName.name,
      baseSlug: slug.baseSlug,
      hasSuffix: branchName.hasSuffix,
      slugSource: slug.source,
    },
  };
}

type LatestCommitFactsResult =
  | { ok: true; facts: LatestCommitFacts }
  | Extract<
      LatestCommitPreparationResult,
      {
        kind:
          | "trunk_lookup_failed"
          | "trunk_refusal"
          | "upstream_check_failed"
          | "pushed_head_refusal"
          | "child_branch_check_failed"
          | "child_branch_refusal"
          | "commit_parent_lookup_failed"
          | "root_commit_refusal"
          | "merge_commit_refusal"
          | "commit_evidence_failed";
      }
    >;

async function loadLatestCommitFacts(
  ctx: SdlExtensionApi,
  snapshot: PendingWorktreeSnapshot,
): Promise<LatestCommitFactsResult> {
  const trunk = await execGt(ctx, ["trunk", "--no-interactive"], GT_TIMEOUT_MS);
  if (trunk.code !== 0) {
    return { ok: false, kind: "trunk_lookup_failed", error: formatCommandDetails(trunk) };
  }
  const trunkBranch = trunk.stdout
    .trim()
    .split("\n")
    .find((line) => line.trim().length > 0)
    ?.trim();
  if (!trunkBranch) {
    return { ok: false, kind: "trunk_lookup_failed", error: "gt trunk returned no branch name." };
  }
  if (snapshot.branch === trunkBranch) {
    return { ok: false, kind: "trunk_refusal", branch: snapshot.branch };
  }

  const upstream = await inspectUpstreamHeadState(ctx);
  if (upstream.type === "failed") {
    return { ok: false, kind: "upstream_check_failed", error: upstream.error };
  }
  if (upstream.type === "upstream_contains_head") {
    return { ok: false, kind: "pushed_head_refusal", upstream: upstream.upstream };
  }

  const children = await inspectGraphiteChildBranches(ctx);
  if (!children.ok) {
    return { ok: false, kind: "child_branch_check_failed", error: children.error };
  }
  if (children.children.length > 0) {
    return { ok: false, kind: "child_branch_refusal", children: children.children };
  }

  const parents = await execGit(
    ctx,
    ["rev-list", "--parents", "-n", "1", "HEAD"],
    GIT_FACT_TIMEOUT_MS,
  );
  if (parents.code !== 0) {
    return { ok: false, kind: "commit_parent_lookup_failed", error: formatCommandDetails(parents) };
  }
  const [headSha, ...parentShas] = parents.stdout.trim().split(/\s+/).filter(Boolean);
  if (!headSha) {
    return {
      ok: false,
      kind: "commit_parent_lookup_failed",
      error: "git rev-list returned no HEAD commit.",
    };
  }
  if (parentShas.length === 0) {
    return { ok: false, kind: "root_commit_refusal", headSha };
  }
  if (parentShas.length > 1) {
    return { ok: false, kind: "merge_commit_refusal", headSha, parentCount: parentShas.length };
  }

  const [message, diff] = await Promise.all([
    execGit(ctx, ["log", "-1", "--format=%B"], GIT_FACT_TIMEOUT_MS),
    execGit(ctx, ["diff", "HEAD^", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS),
  ]);
  if (message.code !== 0) {
    return { ok: false, kind: "commit_evidence_failed", error: formatCommandDetails(message) };
  }
  if (diff.code !== 0) {
    return { ok: false, kind: "commit_evidence_failed", error: formatCommandDetails(diff) };
  }
  const commitSubject = message.stdout.split("\n")[0]?.trim();
  const commitSummary = commitSubject ? `${shortSha(headSha)} ${commitSubject}` : shortSha(headSha);

  return {
    ok: true,
    facts: {
      sourceBranch: snapshot.branch,
      trunkBranch,
      originalHeadSha: headSha,
      parentSha: parentShas[0] as string,
      commitMessage: message.stdout,
      commitDiff: diff.stdout,
      commitSummary,
      ...(upstream.type === "head_not_in_upstream" ? { upstream: upstream.upstream } : {}),
    },
  };
}

async function inspectGraphiteChildBranches(
  ctx: SdlExtensionApi,
): Promise<{ ok: true; children: string[] } | { ok: false; error: string }> {
  const children = await execGt(ctx, ["children", "--no-interactive"], GT_TIMEOUT_MS);
  if (children.code !== 0) {
    return { ok: false, error: formatCommandDetails(children) };
  }
  return { ok: true, children: nonEmptyLines(children.stdout) };
}

async function prepareLatestCommitSlug(
  ctx: SdlExtensionApi,
  facts: LatestCommitFacts,
): Promise<
  | { ok: true; baseSlug: string; source: LatestCommitAutobranchPlan["slugSource"] }
  | Extract<LatestCommitPreparationResult, { kind: "slug_generation_failed" }>
> {
  const result = await deriveBranchSlug(
    ctx,
    buildBranchSlugPrompt({
      intro: "Generate a concise git branch slug for the latest commit below.",
      inference:
        "Infer the actual code, docs, or product change from the commit and diff contents.",
      evidenceSections: [
        {
          heading: "commit message",
          content: facts.commitMessage,
          emptyText: "(empty commit message)",
        },
        {
          heading: "git diff HEAD^ HEAD",
          content: facts.commitDiff,
          emptyText: "(no diff)",
          maxChars: MAX_DIFF_CHARS,
        },
      ],
    }),
  );
  if (result.ok) {
    return { ok: true, baseSlug: result.baseSlug, source: result.source };
  }
  return {
    ok: false,
    kind: "slug_generation_failed",
    error: `Could not derive a branch slug for the latest commit. Rerun with --slug <name>.\n${result.formattedFailure}`,
  };
}

async function runLatestCommitAutobranchTransaction(
  ctx: SdlExtensionApi,
  plan: LatestCommitAutobranchPlan,
): Promise<LatestCommitTransactionResult> {
  const upstream = await inspectUpstreamHeadState(ctx);
  if (upstream.type === "failed") {
    return { ok: false, kind: "transaction_upstream_check_failed", error: upstream.error };
  }
  if (upstream.type === "upstream_contains_head") {
    return { ok: false, kind: "pushed_head_refusal", upstream: upstream.upstream };
  }

  const backupBranch = await chooseAvailableBackupBranchName(ctx, plan.sourceBranch, Date.now());
  if (!backupBranch.ok) {
    return { ok: false, kind: "backup_branch_name_unavailable", sourceBranch: plan.sourceBranch };
  }

  const backupCreated = await execGit(
    ctx,
    ["branch", backupBranch.name, plan.originalHeadSha],
    GIT_FACT_TIMEOUT_MS,
  );
  if (backupCreated.code !== 0) {
    return { ok: false, kind: "backup_create_failed", error: formatCommandDetails(backupCreated) };
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

  const created = await execGt(
    ctx,
    ["create", plan.branchName, "--no-interactive", "--no-ai"],
    GT_TIMEOUT_MS,
  );
  if (created.code !== 0) {
    const recovery = await restoreSourceAndDeleteCreatedBranch(ctx, plan);
    return {
      ok: false,
      kind: "graphite_create_failed",
      backupBranch: backupBranch.name,
      branchName: plan.branchName,
      createError: formatCommandDetails(created),
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
      kind: "branch_reset_failed",
      backupBranch: backupBranch.name,
      branchName: plan.branchName,
      resetError: formatCommandDetails(resetBranch),
      ...recovery,
    };
  }

  const verified = await execGit(ctx, ["rev-parse", "HEAD"], GIT_FACT_TIMEOUT_MS);
  const actualHead = verified.stdout.trim();
  if (verified.code !== 0 || actualHead !== plan.originalHeadSha) {
    const recovery = await restoreSourceAndDeleteCreatedBranch(ctx, plan);
    return {
      ok: false,
      kind: "head_verify_failed",
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
      backupDeleted: false,
      backupBranch: backupBranch.name,
      backupDeleteError: formatCommandDetails(deleted),
    };
  }
  return { ok: true, commitSummary: plan.commitSummary, backupDeleted: true };
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
  const withoutPlanSuffix = normalizeBranchSlugText(value)
    .replace(/(?:-plan)+$/g, "")
    .replace(/-+$/g, "");
  return withoutPlanSuffix
    .slice(0, MAX_BACKUP_SEGMENT_CHARS)
    .replace(/(?:-plan)+$/g, "")
    .replace(/-+$/g, "");
}

async function inspectUpstreamHeadState(ctx: SdlExtensionApi): Promise<UpstreamHeadState> {
  const branch = await execGit(ctx, ["branch", "--show-current"], GIT_FACT_TIMEOUT_MS);
  if (branch.code !== 0) {
    return { type: "failed", error: formatCommandDetails(branch) };
  }
  const branchName = firstNonEmptyLine(branch.stdout);
  if (!branchName) {
    return { type: "failed", error: "git branch --show-current returned no branch name." };
  }

  const upstream = await execGit(
    ctx,
    ["for-each-ref", "--format=%(upstream:short)", `refs/heads/${branchName}`],
    GIT_FACT_TIMEOUT_MS,
  );
  if (upstream.code !== 0) {
    return { type: "failed", error: formatCommandDetails(upstream) };
  }

  const upstreamName = firstNonEmptyLine(upstream.stdout);
  if (!upstreamName) {
    return { type: "no_upstream" };
  }

  const containsHead = await execGit(
    ctx,
    ["merge-base", "--is-ancestor", "HEAD", upstreamName],
    GIT_FACT_TIMEOUT_MS,
  );
  if (containsHead.code === 0) {
    return { type: "upstream_contains_head", upstream: upstreamName };
  }
  if (containsHead.code === 1) {
    return { type: "head_not_in_upstream", upstream: upstreamName };
  }
  return { type: "failed", error: formatCommandDetails(containsHead) };
}


function formatLatestCommitPreparationFailure(
  result: Extract<LatestCommitPreparationResult, { ok: false }>,
): string {
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

function formatLatestCommitTransactionFailure(
  result: Extract<LatestCommitTransactionResult, { ok: false }>,
): string {
  switch (result.kind) {
    case "backup_branch_name_unavailable":
      return `Could not find an available recovery branch name for ${result.sourceBranch}; refusing to move latest commit.`;
    case "backup_create_failed":
      return ["Failed to create recovery branch before moving latest commit.", result.error].join(
        "\n",
      );
    case "source_reset_failed":
      return [
        "Failed to reset source branch before Graphite branch creation.",
        `Recovery branch: ${result.backupBranch}`,
        result.error,
        formatSourceResetCleanup(result),
      ].join("\n");
    case "graphite_create_failed":
      return [
        "Failed to create Graphite branch after resetting source branch.",
        `Recovery branch: ${result.backupBranch}`,
        result.createError,
        result.restored
          ? "Restored source branch to the original HEAD."
          : `Could not restore source branch: ${result.restoreError}`,
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
        result.restored
          ? "Restored source branch to the original HEAD."
          : `Could not restore source branch: ${result.restoreError}`,
        formatCreatedBranchCleanup(result),
      ].join("\n");
    case "head_verify_failed":
      return [
        `Created Graphite branch ${result.branchName}, but HEAD verification failed after moving it.`,
        `Expected original commit, found: ${result.actualHead}`,
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

