import type { SdlExtensionApi } from "@sdl/sdl/sdk";

import { MAX_BRANCH_SLUG_LENGTH, trimBranchSlugToLength } from "./branch-slug-text.ts";
import { GIT_FACT_TIMEOUT_MS } from "./command-exec.ts";
import { execGit } from "./worktree.ts";

export interface AvailableBranchName {
  name: string;
  hasSuffix: boolean;
}

export async function chooseAvailableBranchName(
  ctx: SdlExtensionApi,
  baseSlug: string,
): Promise<({ ok: true } & AvailableBranchName) | { ok: false }> {
  const candidates = branchNameCandidates(
    (_, suffix) =>
      trimBranchSlugToLength(baseSlug, MAX_BRANCH_SLUG_LENGTH - suffix.length) + suffix,
  );
  const available = await findAvailableBranchName(ctx, candidates);
  if (!available) return { ok: false };
  return available;
}

export async function findAvailableBranchName<TName extends string>(
  ctx: SdlExtensionApi,
  candidates: Iterable<{ name: TName; hasSuffix: boolean }>,
): Promise<({ ok: true } & AvailableBranchName & { name: TName }) | undefined> {
  for (const candidate of candidates) {
    const availability = await inspectBranchNameAvailability(ctx, candidate.name);
    if (availability === "available") {
      return { ok: true, name: candidate.name, hasSuffix: candidate.hasSuffix };
    }
  }
  return undefined;
}

async function inspectBranchNameAvailability(
  ctx: SdlExtensionApi,
  candidate: string,
): Promise<"available" | "unavailable"> {
  const valid = await execGit(
    ctx,
    ["check-ref-format", "--branch", candidate],
    GIT_FACT_TIMEOUT_MS,
  );
  if (valid.code !== 0) return "unavailable";

  const exact = await execGit(
    ctx,
    ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`],
    GIT_FACT_TIMEOUT_MS,
  );
  if (exact.code === 0) return "unavailable";
  if (exact.code !== 1) return "unavailable";
  return "available";
}

export function* branchNameCandidates<TName extends string>(
  nameBuilder: (index: number, suffix: string) => TName,
): Iterable<{ name: TName; hasSuffix: boolean }> {
  for (let index = 0; index < 50; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    yield { name: nameBuilder(index, suffix), hasSuffix: index > 0 };
  }
}
