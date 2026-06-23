import type { SdlExtensionApi } from "@sdl/sdl/sdk";

import { chooseAvailableBranchName } from "../branch-availability.ts";
import {
  buildBranchSlugPrompt,
  deriveBranchSlug,
  MAX_DIFF_CHARS,
  prepareRequestedBranchSlug,
} from "../branch-slugs.ts";
import { GIT_FACT_TIMEOUT_MS, execGt } from "../command-exec.ts";
import { shortSha } from "../branch-slug-text.ts";
import { execGit, formatCommandDetails, type PendingWorktreeSnapshot } from "../worktree.ts";
import { inspectGraphiteChildBranches, inspectUpstreamHeadState } from "./git.ts";
import type {
  LatestCommitAutobranchArgs,
  LatestCommitAutobranchPlan,
  LatestCommitFacts,
  LatestCommitPreparationResult,
} from "./types.ts";

type LatestCommitFactsResult =
  | { ok: true; facts: LatestCommitFacts }
  | Extract<LatestCommitPreparationResult, { kind: "inspect_failed" | "refusal" }>;

export async function prepareLatestCommitAutobranchPlan(
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

async function loadLatestCommitFacts(
  ctx: SdlExtensionApi,
  snapshot: PendingWorktreeSnapshot,
): Promise<LatestCommitFactsResult> {
  const trunk = await execGt(ctx, ["trunk", "--no-interactive"]);
  if (trunk.code !== 0) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "trunk_lookup",
      error: formatCommandDetails(trunk),
    };
  }
  const trunkBranch = trunk.stdout
    .trim()
    .split("\n")
    .find((line) => line.trim().length > 0)
    ?.trim();
  if (!trunkBranch) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "trunk_lookup",
      error: "gt trunk returned no branch name.",
    };
  }
  if (snapshot.branch === trunkBranch) {
    return { ok: false, kind: "refusal", reason: "trunk_branch", branch: snapshot.branch };
  }

  const upstream = await inspectUpstreamHeadState(ctx);
  if (upstream.type === "failed") {
    return { ok: false, kind: "inspect_failed", phase: "upstream_check", error: upstream.error };
  }
  if (upstream.type === "upstream_contains_head") {
    return { ok: false, kind: "refusal", reason: "pushed_head", upstream: upstream.upstream };
  }

  const children = await inspectGraphiteChildBranches(ctx);
  if (!children.ok) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "child_branch_check",
      error: children.error,
    };
  }
  if (children.children.length > 0) {
    return { ok: false, kind: "refusal", reason: "child_branches", children: children.children };
  }

  const parents = await execGit(
    ctx,
    ["rev-list", "--parents", "-n", "1", "HEAD"],
    GIT_FACT_TIMEOUT_MS,
  );
  if (parents.code !== 0) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "commit_parent_lookup",
      error: formatCommandDetails(parents),
    };
  }
  const [headSha, ...parentShas] = parents.stdout.trim().split(/\s+/).filter(Boolean);
  if (!headSha) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "commit_parent_lookup",
      error: "git rev-list returned no HEAD commit.",
    };
  }
  if (parentShas.length === 0) {
    return { ok: false, kind: "refusal", reason: "root_commit", headSha };
  }
  if (parentShas.length > 1) {
    return {
      ok: false,
      kind: "refusal",
      reason: "merge_commit",
      headSha,
      parentCount: parentShas.length,
    };
  }

  const [message, diff] = await Promise.all([
    execGit(ctx, ["log", "-1", "--format=%B"], GIT_FACT_TIMEOUT_MS),
    execGit(ctx, ["diff", "HEAD^", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS),
  ]);
  if (message.code !== 0) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "commit_evidence",
      error: formatCommandDetails(message),
    };
  }
  if (diff.code !== 0) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "commit_evidence",
      error: formatCommandDetails(diff),
    };
  }
  const commitSubject = message.stdout.split("\n")[0]?.trim();
  const commitSummary = commitSubject ? `${shortSha(headSha)} ${commitSubject}` : shortSha(headSha);
  const parentSha = parentShas[0];
  if (parentSha === undefined) {
    return {
      ok: false,
      kind: "inspect_failed",
      phase: "commit_parent_lookup",
      error: "git rev-list returned no parent commit.",
    };
  }

  return {
    ok: true,
    facts: {
      sourceBranch: snapshot.branch,
      trunkBranch,
      originalHeadSha: headSha,
      parentSha,
      commitMessage: message.stdout,
      commitDiff: diff.stdout,
      commitSummary,
      ...(upstream.type === "head_not_in_upstream" ? { upstream: upstream.upstream } : {}),
    },
  };
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
