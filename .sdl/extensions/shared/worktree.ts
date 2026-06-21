import { createCommitWithPreparedMessage } from "@sdl/sdl/checkpoint-flow";
import {
  formatPendingWorktreeCommandDetails,
  loadPendingWorktreeSnapshot,
  type WorktreeCommandResult,
} from "@sdl/sdl/pending-worktree";
import type { ExecResult, SdlExtensionApi } from "@sdl/sdl/sdk";

// Checked-in repo-local SDL migration extensions may use @sdl/sdl internal
// migration exports to avoid copying canonical command primitives. This file
// preserves the local extension-facing shapes and messages.
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

async function loadExtensionPendingWorktreeSnapshot(
  ctx: SdlExtensionApi,
): Promise<
  { ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
  const loaded = await loadPendingWorktreeSnapshot({
    cwd: ctx.cwd,
    execGit: (args, timeoutMs) => execGit(ctx, args, timeoutMs),
  });

  if (!loaded.ok) {
    return {
      ok: false,
      error: {
        kind: loaded.error.kind,
        result: loaded.error.result,
      },
    };
  }

  return {
    ok: true,
    snapshot: {
      root: loaded.snapshot.root,
      branch: loaded.snapshot.branch,
      status: loaded.snapshot.status,
      diff: loaded.snapshot.diff,
      isClean: loaded.snapshot.clean,
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

function createExtensionCommitWithPreparedMessage(
  ctx: SdlExtensionApi,
  message: string,
): Promise<{ summary: string } | { error: string }> {
  return createCommitWithPreparedMessage({
    cwd: ctx.cwd,
    message,
    exec: (command, args, _cwd, timeoutMs) => ctx.exec(command, args, { timeoutMs }),
  });
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
  return formatPendingWorktreeCommandDetails(result);
}

export {
  createExtensionCommitWithPreparedMessage as createCommitWithPreparedMessage,
  loadExtensionPendingWorktreeSnapshot as loadPendingWorktreeSnapshot,
};
