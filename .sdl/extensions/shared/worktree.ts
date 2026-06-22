import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExecResult, SdlExtensionApi } from "@sdl/sdl/sdk";

const GIT_FACT_TIMEOUT_MS = 30_000;

export type WorktreeCommandResult = ExecResult;

export interface PendingWorktreeSnapshot {
  root: string;
  branch: string;
  status: string;
  diff: string;
  isClean: boolean;
}

export type PendingWorktreeError =
  | { kind: "not_git_repo"; result: WorktreeCommandResult }
  | { kind: "detached_head"; result: WorktreeCommandResult }
  | { kind: "status_failed"; result: WorktreeCommandResult }
  | { kind: "diff_failed"; result: WorktreeCommandResult };

export async function loadPendingWorktreeSnapshot(
  ctx: SdlExtensionApi,
): Promise<
  { ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
  const root = await execGit(ctx, ["rev-parse", "--show-toplevel"], GIT_FACT_TIMEOUT_MS);
  if (root.code !== 0) {
    return { ok: false, error: { kind: "not_git_repo", result: root } };
  }

  const branch = await execGit(ctx, ["symbolic-ref", "--short", "HEAD"], GIT_FACT_TIMEOUT_MS);
  if (branch.code !== 0) {
    return { ok: false, error: { kind: "detached_head", result: branch } };
  }

  const status = await execGit(ctx, ["status", "--porcelain=v1"], GIT_FACT_TIMEOUT_MS);
  if (status.code !== 0) {
    return { ok: false, error: { kind: "status_failed", result: status } };
  }

  const diff = await execGit(ctx, ["diff", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS);
  if (diff.code !== 0) {
    return { ok: false, error: { kind: "diff_failed", result: diff } };
  }

  return {
    ok: true,
    snapshot: {
      root: root.stdout.trim(),
      branch: branch.stdout.trim(),
      status: status.stdout,
      diff: diff.stdout,
      isClean: status.stdout.trim().length === 0,
    },
  };
}

export function execGit(
  ctx: SdlExtensionApi,
  args: readonly string[],
  timeoutMs: number,
): Promise<ExecResult> {
  return ctx.exec("git", [...args], { timeoutMs });
}

export async function createCommitWithPreparedMessage(
  ctx: SdlExtensionApi,
  message: string,
): Promise<{ summary: string } | { error: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), "sdl-extension-cp-commit-"));
  try {
    const messagePath = join(tempDir, "message.txt");
    await writeFile(messagePath, `${message}\n`, "utf8");

    const add = await ctx.exec("git", ["add", "-A"], { timeoutMs: 30_000 });
    if (add.code !== 0) {
      return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
    }

    const commit = await ctx.exec("git", ["commit", "-F", messagePath], { timeoutMs: 120_000 });
    if (commit.code !== 0) {
      return { error: formatCommandError("Checkpoint commit failed.", commit) };
    }

    const log = await ctx.exec("git", ["log", "-1", "--oneline"], { timeoutMs: 5_000 });
    if (log.code !== 0) {
      return {
        error: formatCommandError("Created checkpoint commit, but failed to read it back.", log),
      };
    }

    return { summary: log.stdout.trim() };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export function formatPendingWorktreeError(error: PendingWorktreeError): string {
  const details = formatCommandDetails(error.result);
  if (error.kind === "not_git_repo") {
    return `Not inside a git repository.\n${details}`;
  }
  if (error.kind === "detached_head") {
    return `Could not determine current branch.\n${details}`;
  }
  if (error.kind === "status_failed") {
    return `Could not inspect git status.\n${details}`;
  }
  return `Could not capture git diff.\n${details}`;
}

export function formatCommandError(summary: string, result: ExecResult): string {
  return [summary, formatCommandDetails(result)].join("\n");
}

export function formatCommandDetails(result: WorktreeCommandResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  const killed = result.killed ? " (killed or timed out)" : "";
  return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}
