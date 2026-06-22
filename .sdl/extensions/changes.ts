import { defineExtension, failed, ok } from "@sdl/sdl/sdk";
import {
  CHANGES_MODEL_ENV,
  DEFAULT_CHANGES_MODEL_REF,
  LEGACY_CHANGES_MODEL_ENV,
} from "@sdl/sdl/text-generation";
import { draftChangesSummary } from "./shared/text-helpers.ts";
import type { ExecResult, SdlExtensionApi } from "@sdl/sdl/sdk";

// This project-local extension uses the public SDL SDK plus internal migration
// exports while duplicated workflow helpers move into package-owned modules.
const GIT_FACT_TIMEOUT_MS = 30_000;
const MAX_DISPLAY_FILE_LINES = 50;

const CHANGES_COMMAND_DESCRIPTION = `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

Environment:
  ${CHANGES_MODEL_ENV}  Model reference for generated changes summaries. Defaults to ${DEFAULT_CHANGES_MODEL_REF}. Falls back to ${LEGACY_CHANGES_MODEL_ENV} when unset.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`;

interface PendingWorktreeSnapshot {
  root: string;
  branch: string;
  status: string;
  diff: string;
  isClean: boolean;
}

type PendingWorktreeError =
  | { kind: "not_git_repo"; result: ExecResult }
  | { kind: "detached_head"; result: ExecResult }
  | { kind: "status_failed"; result: ExecResult }
  | { kind: "diff_failed"; result: ExecResult };

export default defineExtension({
  commands: [
    {
      name: "changes",
      description: CHANGES_COMMAND_DESCRIPTION,
      async run(ctx) {
        const loaded = await loadPendingWorktreeSnapshot(ctx);
        if (!loaded.ok) {
          return failed(formatPendingWorktreeError(loaded.error), 2);
        }

        const snapshot = loaded.snapshot;
        if (snapshot.isClean) {
          return ok("Working tree is clean; no outstanding changes.");
        }

        const summary = await draftChangesSummary({
          textGenerator: ctx.textGenerator,
          env: ctx.env,
          snapshot,
        });
        if (!summary.ok) {
          return failed(summary.error, 2);
        }

        return ok(formatOutstandingChangesMessage(snapshot, summary.summaryText));
      },
    },
  ],
});

async function loadPendingWorktreeSnapshot(
  ctx: SdlExtensionApi,
): Promise<
  { ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
  const root = await execGit(ctx, ["rev-parse", "--show-toplevel"]);
  if (root.code !== 0) {
    return { ok: false, error: { kind: "not_git_repo", result: root } };
  }

  const branch = await execGit(ctx, ["symbolic-ref", "--short", "HEAD"]);
  if (branch.code !== 0) {
    return { ok: false, error: { kind: "detached_head", result: branch } };
  }

  const status = await execGit(ctx, ["status", "--porcelain=v1"]);
  if (status.code !== 0) {
    return { ok: false, error: { kind: "status_failed", result: status } };
  }

  const diff = await execGit(ctx, ["diff", "HEAD", "--no-ext-diff"]);
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

function execGit(ctx: SdlExtensionApi, args: string[]): Promise<ExecResult> {
  return ctx.exec("git", args, { timeoutMs: GIT_FACT_TIMEOUT_MS });
}

function formatOutstandingChangesMessage(
  snapshot: PendingWorktreeSnapshot,
  summaryText: string,
): string {
  const lines = [`Outstanding changes on ${snapshot.branch}`, ""];
  lines.push(
    ...summaryText
      .trim()
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0),
  );
  lines.push("", "Files:");
  lines.push(...displayFileLines(statusFileLines(snapshot.status)));
  return lines.join("\n");
}

function statusFileLines(status: string): string[] {
  return status
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.length > 0);
}

function displayFileLines(fileLines: readonly string[]): string[] {
  if (fileLines.length === 0) {
    return ["(no status lines)"];
  }

  const displayed = fileLines.slice(0, MAX_DISPLAY_FILE_LINES);
  const omitted = fileLines.length - displayed.length;
  if (omitted > 0) {
    displayed.push(`... ${omitted} more file(s)`);
  }
  return displayed;
}

function formatPendingWorktreeError(error: PendingWorktreeError): string {
  const details = formatPendingWorktreeCommandDetails(error.result);
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

function formatPendingWorktreeCommandDetails(result: ExecResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  const killed = result.killed ? " (killed or timed out)" : "";
  return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}
