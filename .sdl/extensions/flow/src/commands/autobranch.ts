import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { defineExtension, failed, formatCommandDetails, ok, z } from "@sdl/sdl/sdk";
import {
  buildBranchSlugPrompt,
  chooseAvailableBranchName,
  DEFAULT_FAST_MODEL_REF,
  deriveBranchSlug,
  MAX_DIFF_CHARS,
  prepareRequestedBranchSlug,
  sanitizeBranchName,
  SLUG_MODEL_ENV,
} from "../shared/branch-slugs.ts";
import { prepareCheckpointMessage } from "../shared/text-helpers.ts";
import {
  CHECKPOINT_MODEL_ENV,
  DEFAULT_CHECKPOINT_MODEL_REF,
  LEGACY_CHECKPOINT_MODEL_ENV,
  selectCheckpointModelRef,
} from "../shared/text-generation.ts";
import {
  createCommitWithPreparedMessage,
  execGit,
  loadFlowPendingWorktreeSnapshot,
  type PendingWorktreeError,
  type PendingWorktreeSnapshot,
} from "../shared/worktree.ts";
import type { ExecResult, SdlExtensionApi } from "@sdl/sdl/sdk";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GT_CREATE_TIMEOUT_MS = 120_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;
const MAX_UNTRACKED_FILES = 12;
const MAX_UNTRACKED_FILE_CHARS = 4_000;

const AUTOBRANCH_DESCRIPTION = `Create a Graphite branch using \`gt create\` from dirty worktree changes.

This command requires pending worktree changes. It stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit.

If the worktree is clean, use \`sdl flow branch-latest-commit\` to move the latest eligible unpushed commit to a new Graphite child branch.

Environment:
  ${SLUG_MODEL_ENV}  Model reference for generated branch slugs. Defaults to ${DEFAULT_FAST_MODEL_REF}.
  ${CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const autobranchRequestSchema = z.object({
  slug: z
    .string()
    .optional()
    .describe("Branch slug to use instead of deriving one from the worktree."),
});

type AutobranchRequest = z.output<typeof autobranchRequestSchema>;

interface ParsedAutobranchArgs {
  slug?: string;
}

interface FileStat {
  size: number;
  isFile(): boolean;
}

interface AutobranchSnapshot extends PendingWorktreeSnapshot {
  untracked: string;
}

interface AutobranchPlan {
  branchName: string;
  baseSlug: string;
  slugSource: "requested" | "model" | "fallback";
  hasSuffix: boolean;
  checkpointMessage: string;
}

interface AutobranchPreparationWarning {
  kind: "slug_model_failed";
  fallbackSlug: string;
}

type AutobranchPreparationResult =
  | { ok: true; plan: AutobranchPlan; warnings: AutobranchPreparationWarning[] }
  | { ok: false; kind: "invalid_requested_slug"; requestedSlug: string }
  | { ok: false; kind: "slug_generation_failed"; error: string }
  | { ok: false; kind: "branch_name_unavailable"; baseSlug: string }
  | { ok: false; kind: "checkpoint_prepare_failed"; error: string };

type AutobranchTransactionResult =
  | { ok: true; commitSummary: string }
  | { ok: false; kind: "stash_failed"; error: string }
  | { ok: false; kind: "stash_ref_missing"; stashMessage: string; error: string }
  | { ok: false; kind: "graphite_create_failed"; createError: string; restored: true }
  | {
      ok: false;
      kind: "graphite_create_failed";
      createError: string;
      restored: false;
      restoreError: string;
    }
  | { ok: false; kind: "restore_failed_after_branch_create"; restoreError: string }
  | { ok: false; kind: "commit_failed_after_branch_create"; commitError: string };

type AutobranchFlowResult =
  | { ok: true; summary: string; warnings: string[] }
  | { ok: false; error: string };

export default defineExtension({
  commands: [
    {
      name: "autobranch",
      summary: "Create a Graphite branch from dirty worktree changes.",
      description: AUTOBRANCH_DESCRIPTION,
      schema: autobranchRequestSchema,
      async run(ctx, request: AutobranchRequest) {
        const args: ParsedAutobranchArgs = request.slug === undefined ? {} : { slug: request.slug };
        const result = await createAutobranchCheckpointFlow(ctx, args);
        if (!result.ok) {
          return failed(result.error.trimEnd(), 1);
        }
        for (const warning of result.warnings) {
          ctx.stderr?.(`${warning.trimEnd()}\n`);
        }
        return ok(result.summary.trimEnd());
      },
    },
  ],
});

async function createAutobranchCheckpointFlow(
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
): Promise<AutobranchFlowResult> {
  const loaded = await loadFlowPendingWorktreeSnapshot(ctx);
  if (!loaded.ok) {
    return { ok: false, error: formatAutobranchSnapshotError(loaded.error) };
  }

  const snapshot = loaded.snapshot;
  if (snapshot.clean) {
    return {
      ok: false,
      error:
        "Working tree is clean; use `sdl flow branch-latest-commit` to move the latest eligible unpushed commit to a new Graphite child branch.",
    };
  }

  return runDirtyAutobranchFlow(ctx, args, snapshot);
}

function execGt(
  ctx: SdlExtensionApi,
  args: readonly string[],
  timeoutMs: number,
): Promise<ExecResult> {
  return ctx.exec("gt", [...args], { timeoutMs });
}

async function runDirtyAutobranchFlow(
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
  snapshot: PendingWorktreeSnapshot,
): Promise<AutobranchFlowResult> {
  const prepared = await prepareAutobranchPlan(ctx, args, snapshot);
  if (!prepared.ok) {
    return { ok: false, error: formatAutobranchPreparationFailure(prepared) };
  }

  const warnings = prepared.warnings.map(formatAutobranchPreparationWarning);
  const transaction = await runAutobranchTransaction(
    ctx,
    prepared.plan.branchName,
    prepared.plan.checkpointMessage,
  );
  if (!transaction.ok) {
    return {
      ok: false,
      error: formatAutobranchTransactionFailure(transaction, prepared.plan.branchName),
    };
  }

  const cleanliness = await execGit(ctx, ["status", "--porcelain=v1"], GIT_FACT_TIMEOUT_MS);
  const isWorkingTreeClean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
  const suffix = prepared.plan.hasSuffix
    ? ` (base slug ${prepared.plan.baseSlug} was unavailable)`
    : "";

  return {
    ok: true,
    summary: [
      `New branch: ${prepared.plan.branchName}${suffix}`,
      `Stacked on: ${snapshot.branch}`,
      `Commit: ${transaction.commitSummary}`,
      isWorkingTreeClean
        ? "Working directory is clean."
        : "Warning: working directory is not clean after checkpoint.",
    ].join("\n"),
    warnings,
  };
}

async function prepareAutobranchPlan(
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
  snapshot: PendingWorktreeSnapshot,
): Promise<AutobranchPreparationResult> {
  const warnings: AutobranchPreparationWarning[] = [];
  const slug = await prepareBaseSlug(ctx, args, snapshot);
  if (!slug.ok) return slug;
  if (slug.warning) warnings.push(slug.warning);

  const branchName = await chooseAvailableBranchName(ctx, slug.baseSlug);
  if (!branchName.ok) {
    return { ok: false, kind: "branch_name_unavailable", baseSlug: slug.baseSlug };
  }

  const prepared = await prepareCheckpointMessage({
    status: snapshot.status,
    diff: snapshot.diff,
    textGenerator: ctx.textGenerator,
    modelRef: selectCheckpointModelRef(ctx.env),
  });
  if (!prepared.ok) {
    return { ok: false, kind: "checkpoint_prepare_failed", error: prepared.error };
  }

  return {
    ok: true,
    plan: {
      branchName: branchName.name,
      baseSlug: slug.baseSlug,
      slugSource: slug.source,
      hasSuffix: branchName.hasSuffix,
      checkpointMessage: prepared.message,
    },
    warnings,
  };
}

type PreparedBaseSlugResult =
  | {
      ok: true;
      baseSlug: string;
      source: AutobranchPlan["slugSource"];
      warning?: AutobranchPreparationWarning;
    }
  | Extract<
      AutobranchPreparationResult,
      { kind: "invalid_requested_slug" | "slug_generation_failed" }
    >;

async function prepareBaseSlug(
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
  snapshot: PendingWorktreeSnapshot,
): Promise<PreparedBaseSlugResult> {
  const requested = prepareRequestedBranchSlug(args.slug);
  if (requested.kind === "invalid_requested_slug") {
    return { ok: false, kind: "invalid_requested_slug", requestedSlug: requested.requestedSlug };
  }
  if (requested.kind === "slug") {
    return { ok: true, baseSlug: requested.baseSlug, source: requested.source };
  }

  const untracked = await readUntrackedSnippets(ctx, snapshot.root);
  return generateSlugFromChanges(ctx, { ...snapshot, untracked });
}

async function readUntrackedSnippets(ctx: SdlExtensionApi, root: string): Promise<string> {
  const listed = await execGit(
    ctx,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    GIT_FACT_TIMEOUT_MS,
  );
  if (listed.code !== 0 || listed.stdout.length === 0) {
    return "";
  }

  const files = listed.stdout.split("\0").filter(Boolean).slice(0, MAX_UNTRACKED_FILES);
  const snippets: string[] = [];
  for (const file of files) {
    const absolutePath = resolve(root, file);
    if (relative(root, absolutePath).startsWith("..")) {
      continue;
    }

    try {
      const info: FileStat = await stat(absolutePath);
      if (!info.isFile()) {
        snippets.push(`## ${file}\n[not a regular file]`);
        continue;
      }
      const raw = await readFile(absolutePath);
      const buffer = Buffer.from(raw);
      if (buffer.includes(0)) {
        snippets.push(`## ${file}\n[binary file, ${info.size} bytes]`);
        continue;
      }
      const text = buffer.toString("utf8");
      const isTruncated = text.length > MAX_UNTRACKED_FILE_CHARS;
      snippets.push(
        `## ${file}\n${text.slice(0, MAX_UNTRACKED_FILE_CHARS)}${isTruncated ? "\n...[truncated]" : ""}`,
      );
    } catch (error) {
      snippets.push(`## ${file}\n[could not read: ${formatErrorMessage(error)}]`);
    }
  }
  return snippets.join("\n\n");
}

async function generateSlugFromChanges(
  ctx: SdlExtensionApi,
  snapshot: AutobranchSnapshot,
): Promise<PreparedBaseSlugResult> {
  const prompt = buildBranchSlugPrompt({
    intro: "Generate a concise git branch slug for the pending changes below.",
    inference: "Infer the actual code, docs, or product change from the diff contents.",
    evidenceSections: [
      { heading: "git status --porcelain", content: snapshot.status, emptyText: "(clean)" },
      {
        heading: "git diff HEAD",
        content: snapshot.diff,
        emptyText: "(no tracked diff)",
        maxChars: MAX_DIFF_CHARS,
      },
      ...(snapshot.untracked
        ? [
            {
              heading: "untracked file contents",
              content: snapshot.untracked,
              maxChars: MAX_DIFF_CHARS,
            },
          ]
        : []),
    ],
  });
  const result = await deriveBranchSlug(ctx, prompt);
  if (result.ok) {
    return { ok: true, baseSlug: result.baseSlug, source: result.source };
  }

  const fallbackSlug = fallbackSlugFromSnapshot(snapshot);
  if (fallbackSlug) {
    return {
      ok: true,
      baseSlug: fallbackSlug,
      source: "fallback",
      warning: { kind: "slug_model_failed", fallbackSlug },
    };
  }

  return {
    ok: false,
    kind: "slug_generation_failed",
    error: `Could not derive a branch slug.\n${result.formattedFailure}`,
  };
}

function fallbackSlugFromSnapshot(snapshot: AutobranchSnapshot): string | undefined {
  const changedPaths = snapshot.status
    .split("\n")
    .map((line) => line.slice(3).trim())
    .map((line) => line.replace(/^.* -> /, ""))
    .filter(Boolean);
  const basenameWords = changedPaths
    .slice(0, 4)
    .map((path) => path.split("/").pop() ?? path)
    .join(" ");
  return sanitizeBranchName(`update ${basenameWords.length > 0 ? basenameWords : snapshot.branch}`);
}

async function runAutobranchTransaction(
  ctx: SdlExtensionApi,
  branchName: string,
  checkpointMessage: string,
): Promise<AutobranchTransactionResult> {
  const stashMessage = `pi-autobranch:${Date.now()}:${branchName}`;
  const stashed = await stashPendingChanges(ctx, stashMessage);
  if (!stashed.ok) return stashed;

  const created = await createGraphiteBranch(ctx, branchName);
  if (!created.ok) {
    const restored = await restoreStash(ctx, stashed.ref);
    if (restored.ok) {
      return {
        ok: false,
        kind: "graphite_create_failed",
        createError: created.error,
        restored: true,
      };
    }
    return {
      ok: false,
      kind: "graphite_create_failed",
      createError: created.error,
      restored: false,
      restoreError: restored.error,
    };
  }

  const restored = await restoreStash(ctx, stashed.ref);
  if (!restored.ok) {
    return { ok: false, kind: "restore_failed_after_branch_create", restoreError: restored.error };
  }

  const committed = await createCommitWithPreparedMessage(ctx, checkpointMessage);
  if ("error" in committed) {
    return { ok: false, kind: "commit_failed_after_branch_create", commitError: committed.error };
  }

  return { ok: true, commitSummary: committed.summary };
}

async function stashPendingChanges(
  ctx: SdlExtensionApi,
  message: string,
): Promise<
  | { ok: true; ref: string }
  | { ok: false; kind: "stash_failed"; error: string }
  | { ok: false; kind: "stash_ref_missing"; stashMessage: string; error: string }
> {
  const stashed = await execGit(
    ctx,
    ["stash", "push", "--include-untracked", "-m", message],
    STASH_PUSH_TIMEOUT_MS,
  );
  if (stashed.code !== 0) {
    return { ok: false, kind: "stash_failed", error: formatCommandDetails(stashed) };
  }

  const ref = await findStashRef(ctx, message);
  if (!ref.ok) {
    return { ok: false, kind: "stash_ref_missing", stashMessage: message, error: ref.error };
  }
  return { ok: true, ref: ref.ref };
}

async function findStashRef(
  ctx: SdlExtensionApi,
  message: string,
): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const listed = await execGit(ctx, ["stash", "list", "--format=%gd%x00%s"], GIT_FACT_TIMEOUT_MS);
  if (listed.code !== 0) {
    return { ok: false, error: formatCommandDetails(listed) };
  }
  for (const line of listed.stdout.split("\n")) {
    const [ref, subject] = line.split("\0");
    if (ref && subject?.includes(message)) {
      return { ok: true, ref };
    }
  }
  return { ok: false, error: "No matching stash entry found." };
}

async function createGraphiteBranch(
  ctx: SdlExtensionApi,
  branchName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const created = await execGt(
    ctx,
    ["create", branchName, "--no-interactive", "--no-ai"],
    GT_CREATE_TIMEOUT_MS,
  );
  if (created.code !== 0) {
    return { ok: false, error: formatCommandDetails(created) };
  }
  return { ok: true };
}

async function restoreStash(
  ctx: SdlExtensionApi,
  ref: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restored = await execGit(ctx, ["stash", "pop", ref], STASH_POP_TIMEOUT_MS);
  if (restored.code !== 0) {
    return { ok: false, error: formatCommandDetails(restored) };
  }
  return { ok: true };
}

function formatAutobranchSnapshotError(error: PendingWorktreeError): string {
  const details = formatCommandDetails(error.result);
  if (error.kind === "not_git_repo") {
    return `Not inside a git repository.\n${details}`;
  }
  if (error.kind === "detached_head") {
    return `Detached HEAD; check out a branch before autobranching.\n${details}`;
  }
  if (error.kind === "status_failed") {
    return `Could not read git status.\n${details}`;
  }
  return `Could not read git diff.\n${details}`;
}

function formatAutobranchPreparationFailure(
  result: Extract<AutobranchPreparationResult, { ok: false }>,
): string {
  if (result.kind === "invalid_requested_slug") {
    return `Invalid branch slug: ${result.requestedSlug}`;
  }
  if (result.kind === "slug_generation_failed") {
    return result.error;
  }
  if (result.kind === "branch_name_unavailable") {
    return `Could not find an available branch name based on ${result.baseSlug}.`;
  }
  return result.error;
}

function formatAutobranchPreparationWarning(warning: AutobranchPreparationWarning): string {
  return `Slug model failed; using fallback branch name ${warning.fallbackSlug}.`;
}

function formatAutobranchTransactionFailure(
  result: Extract<AutobranchTransactionResult, { ok: false }>,
  branchName: string,
): string {
  if (result.kind === "stash_failed") {
    return [`Failed to stash pending changes before branch creation.`, result.error].join("\n");
  }
  if (result.kind === "stash_ref_missing") {
    return [
      `Stashed pending changes, but could not find the new stash entry for ${result.stashMessage}.`,
      "Inspect `git stash list` before continuing.",
      result.error,
    ].join("\n");
  }
  if (result.kind === "graphite_create_failed") {
    return [
      `Failed to create Graphite branch ${branchName}.`,
      result.createError,
      result.restored
        ? "Restored pending changes to the original branch."
        : `Could not restore pending changes: ${result.restoreError}`,
    ].join("\n");
  }
  if (result.kind === "restore_failed_after_branch_create") {
    return [
      `Created branch ${branchName}, but failed to restore pending changes from the stash.`,
      result.restoreError,
      "Inspect `git stash list` before continuing.",
    ].join("\n");
  }
  return `Branch ${branchName} exists, but checkpoint commit failed. Pending changes remain on that branch.\n${result.commitError}`;
}


function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

