import type { SdlExtensionApi } from "@sdl/sdl/sdk";

import { GIT_FACT_TIMEOUT_MS, execGt } from "../command-exec.ts";
import { firstNonEmptyLine, nonEmptyLines } from "../branch-slug-text.ts";
import { execGit, formatCommandDetails } from "../worktree.ts";
import type { UpstreamHeadState } from "./types.ts";

export async function inspectGraphiteChildBranches(
  ctx: SdlExtensionApi,
): Promise<{ ok: true; children: string[] } | { ok: false; error: string }> {
  const children = await execGt(ctx, ["children", "--no-interactive"]);
  if (children.code !== 0) {
    return { ok: false, error: formatCommandDetails(children) };
  }
  return { ok: true, children: nonEmptyLines(children.stdout) };
}

export async function inspectUpstreamHeadState(ctx: SdlExtensionApi): Promise<UpstreamHeadState> {
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
