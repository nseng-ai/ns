import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import { prepareCheckpointMessage } from "./shared/checkpoint-message.ts";
import type { ExecResult, SdlExtensionApi } from "@sdl/sdl/sdk";

// This project-local extension intentionally uses only the public SDL SDK import plus
// extension-owned shared helpers.
const GIT_FACT_TIMEOUT_MS = 30_000;
const GIT_COMMIT_TIMEOUT_MS = 120_000;
const GIT_LOG_TIMEOUT_MS = 5_000;
const DEFAULT_CHECKPOINT_MODEL_REF = "openai-codex/gpt-5.4-mini";
const CHECKPOINT_MODEL_ENV = "SDL_CHECKPOINT_MODEL";
const LEGACY_CHECKPOINT_MODEL_ENV = "SDL_DEV_CHECKPOINT_MODEL";
const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses main/master, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.

Environment:
  ${CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const cpRequestSchema = z.object({
  dryRun: z.boolean().default(false).describe("Preview the checkpoint message without staging or committing."),
});

type CpRequest = z.output<typeof cpRequestSchema>;

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
      name: "cp",
      description: CP_COMMAND_DESCRIPTION,
      schema: cpRequestSchema,
      async run(ctx, request: CpRequest) {
        const loaded = await loadPendingWorktreeSnapshot(ctx);
        if (!loaded.ok) {
          return failed(formatPendingWorktreeError(loaded.error), 2);
        }

        const snapshot = loaded.snapshot;
        if (snapshot.branch === "main" || snapshot.branch === "master") {
          return failed(`Refusing to create checkpoint commit on trunk branch: ${snapshot.branch}`, 1);
        }
        if (snapshot.isClean) {
          return failed("Working tree is clean; nothing to checkpoint.", 1);
        }

        const prepared = await prepareCheckpointMessage({
          status: snapshot.status,
          diff: snapshot.diff,
          textGenerator: ctx.textGenerator,
          modelRef: selectCheckpointModelRef(ctx.env),
        });
        if (!prepared.ok) {
          return failed(prepared.error, 2);
        }

        if (request.dryRun) {
          return ok(formatDryRunMessage(snapshot, prepared.message));
        }

        const committed = await createCommitWithPreparedMessage(ctx, prepared.message);
        if ("error" in committed) {
          return failed(committed.error, 2);
        }

        return ok(`${committed.summary}\n${prepared.message}`);
      },
    },
  ],
});

async function loadPendingWorktreeSnapshot(
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

function execGit(ctx: SdlExtensionApi, args: string[], timeoutMs: number): Promise<ExecResult> {
  return ctx.exec("git", args, { timeoutMs });
}

function selectCheckpointModelRef(env: Record<string, string | undefined>): string {
  return (
    firstEnvValue(env, CHECKPOINT_MODEL_ENV, LEGACY_CHECKPOINT_MODEL_ENV) ??
    DEFAULT_CHECKPOINT_MODEL_REF
  );
}

function firstEnvValue(
  env: Record<string, string | undefined>,
  ...envNames: readonly string[]
): string | undefined {
  for (const envName of envNames) {
    const value = env[envName]?.trim();
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

async function createCommitWithPreparedMessage(
  ctx: SdlExtensionApi,
  message: string,
): Promise<{ summary: string } | { error: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), "pi-cp-commit-"));
  try {
    const messagePath = join(tempDir, "message.txt");
    await writeFile(messagePath, `${message}\n`, "utf8");

    const add = await execGit(ctx, ["add", "-A"], GIT_FACT_TIMEOUT_MS);
    if (add.code !== 0) {
      return { error: formatCommandError("Failed to stage checkpoint changes.", add) };
    }

    const commit = await execGit(ctx, ["commit", "-F", messagePath], GIT_COMMIT_TIMEOUT_MS);
    if (commit.code !== 0) {
      return { error: formatCommandError("Checkpoint commit failed.", commit) };
    }

    const log = await execGit(ctx, ["log", "-1", "--oneline"], GIT_LOG_TIMEOUT_MS);
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

function formatPendingWorktreeError(error: PendingWorktreeError): string {
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

function formatCommandError(summary: string, result: ExecResult): string {
  return [summary, formatCommandDetails(result)].join("\n");
}

function formatCommandDetails(result: ExecResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  const killed = result.killed ? " (killed or timed out)" : "";
  return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}

function formatDryRunMessage(snapshot: PendingWorktreeSnapshot, message: string): string {
  return `Dry run: would create checkpoint commit on ${snapshot.branch}\n\n${message}`;
}
