import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import { prepareCheckpointMessage } from "./shared/text-helpers.ts";
import type { ExecResult, SdlContext, TextGenerator } from "@sdl/sdl/sdk";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GIT_COMMIT_TIMEOUT_MS = 120_000;
const GIT_LOG_TIMEOUT_MS = 5_000;
const GT_CREATE_TIMEOUT_MS = 120_000;
const GT_TIMEOUT_MS = 120_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;
const DEFAULT_FAST_MODEL_REF = "openai-codex/gpt-5.4-mini";
const DEFAULT_CHECKPOINT_MODEL_REF = DEFAULT_FAST_MODEL_REF;
const CHECKPOINT_MODEL_ENV = "SDL_CHECKPOINT_MODEL";
const LEGACY_CHECKPOINT_MODEL_ENV = "SDL_DEV_CHECKPOINT_MODEL";
const SLUG_MODEL_ENV = "SDL_SLUG_MODEL";
const SLUG_MODEL_TIMEOUT_MS = 60_000;
const SLUG_MODEL_THINKING = "minimal";
const SLUG_MODEL_MAX_ATTEMPTS = 2;
const MAX_ERROR_CHARS = 4_000;
const MAX_BRANCH_SLUG_LENGTH = 50;
const MAX_DIFF_CHARS = 24_000;
const MAX_UNTRACKED_FILES = 12;
const MAX_UNTRACKED_FILE_CHARS = 4_000;
const MAX_BACKUP_SEGMENT_CHARS = 32;
const CHECKPOINT_SUBJECT_MAX_LENGTH = 52;
const CHECKPOINT_MAX_BULLETS = 3;
const CHECKPOINT_DIFF_PROMPT_CHAR_LIMIT = 24_000;
const CHECKPOINT_PER_FILE_EXCERPT_CHAR_LIMIT = 1_500;
const CHECKPOINT_CHANGED_PATH_LIMIT = 120;
const CHECKPOINT_CHANGED_PATH_CHAR_LIMIT = 6_000;
const CHECKPOINT_FINAL_SUMMARY_RESERVE_CHARS = 500;
const CHECKPOINT_REPAIR_PREVIOUS_DRAFT_CHAR_LIMIT = 4_000;
const CHECKPOINT_REPAIR_FEEDBACK_CHAR_LIMIT = 4_000;
const MAX_REPAIR_ATTEMPTS = 2;

const AUTOBRANCH_DESCRIPTION = `Create a Graphite branch using \`gt create\` from dirty worktree changes or from the latest eligible unpushed commit.

Dirty worktree mode stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit. Clean worktree mode moves the latest eligible unpushed non-merge commit onto a new Graphite branch using recovery-branch verification.

Environment:
  ${SLUG_MODEL_ENV}  Model reference for generated branch slugs. Defaults to ${DEFAULT_FAST_MODEL_REF}.
  ${CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const CHECKPOINT_SYSTEM_PROMPT = `You write terse checkpoint commit messages for coding agents.

Given git status and diff, output exactly one git commit message:
- Subject line first, prefixed with "[cp]".
- Subject must be at most 52 characters total. Shorter is better. Use imperative mood with no trailing period.
- Then one blank line.
- Then 1 to 3 bullet lines, each starting with "- ".
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- No Co-Authored-By trailer.
- Mention untracked files by filename when they matter.
- When the diff is compacted, infer from status, paths, and excerpts without claiming exact unseen changes.
- Optimize for later agents scanning git log, not for a polished PR description.`;

const autobranchRequestSchema = z.object({
  slug: z
    .string()
    .optional()
    .describe("Branch slug to use instead of deriving one from the worktree or latest commit."),
});

type AutobranchRequest = z.output<typeof autobranchRequestSchema>;

interface PendingWorktreeSnapshot {
  root: string;
  branch: string;
  status: string;
  diff: string;
  clean: boolean;
}

type PendingWorktreeError =
  | { kind: "not_git_repo"; result: ExecResult }
  | { kind: "detached_head"; result: ExecResult }
  | { kind: "status_failed"; result: ExecResult }
  | { kind: "diff_failed"; result: ExecResult };

interface CheckpointMessage {
  subject: string;
  bullets: string[];
}

type CheckpointMessageIssue =
  | { code: "missing_subject" }
  | { code: "missing_blank_line" }
  | { code: "missing_cp_prefix"; subject: string }
  | { code: "subject_too_long"; length: number; maxLength: number; subject: string }
  | { code: "subject_trailing_period"; subject: string }
  | { code: "no_bullets" }
  | { code: "too_many_bullets"; count: number; maxCount: number }
  | { code: "invalid_bullet_prefix"; lineNumber: number; line: string }
  | { code: "extra_prose"; lineNumber: number; line: string }
  | { code: "code_fence" }
  | { code: "trailer"; lineNumber: number; line: string };

type CheckpointValidationResult =
  | { ok: true; message: CheckpointMessage }
  | { ok: false; normalizedText: string; issues: CheckpointMessageIssue[] };

type PreparedCheckpointMessage =
  | { ok: true; message: string; source: "model" | "repaired_model"; feedback?: string }
  | { ok: false; error: string };

interface CheckpointPromptInput {
  status: string;
  diff: string;
  previousDraft?: string;
  validationFeedback?: string;
}

interface CheckpointDiffPromptSection {
  text: string;
  isCompacted: boolean;
}

interface DiffFileSection {
  path: string;
  text: string;
}

interface TruncateTextOptions {
  value: string;
  maxChars: number;
  shouldTrimInput?: boolean;
  buildMarker: (omittedChars: number) => string;
}

interface TruncateTextHeadTailOptions extends TruncateTextOptions {
  headRatio: number;
  headRounding: "ceil" | "floor";
  shouldTrimHead?: boolean;
  shouldTrimTail?: boolean;
}

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

type RequestedBranchSlugResult =
  | { kind: "absent" }
  | { kind: "slug"; baseSlug: string; source: "requested" }
  | { kind: "invalid_requested_slug"; requestedSlug: string };

interface BranchSlugEvidenceSection {
  heading: string;
  content: string;
  emptyText?: string;
  maxChars?: number;
}

interface BranchSlugPromptInput {
  intro: string;
  inference?: string;
  evidenceSections: readonly BranchSlugEvidenceSection[];
}

type BranchSlugModelResult =
  | { ok: true; baseSlug: string; source: "model" }
  | { ok: false; formattedFailure: string };

interface AvailableBranchName {
  name: string;
  hasSuffix: boolean;
}

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

interface ParsedModelRef {
  provider: string;
  modelId: string;
}

const BRANCH_SLUG_RULES = [
  "- Return only the slug, with no quotes, markdown, or explanation.",
  "- Use kebab-case lowercase ASCII words separated by hyphens.",
  `- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
  "- Lead with a verb when natural, such as add, fix, refactor, migrate, rename, remove, or update.",
  "- Do not use slashes, spaces, underscores, punctuation, or special characters.",
  "- Prefer concrete deliverables and specific nouns over broad words like changes or cleanup.",
] as const;

export default defineExtension({
  commands: [
    {
      name: "autobranch",
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
  ctx: SdlContext,
  args: ParsedAutobranchArgs,
): Promise<AutobranchFlowResult> {
  const loaded = await loadPendingWorktreeSnapshot(ctx);
  if (!loaded.ok) {
    return { ok: false, error: formatAutobranchSnapshotError(loaded.error) };
  }

  const snapshot = loaded.snapshot;
  if (snapshot.clean) {
    return createLatestCommitAutobranchFlow(ctx, args, snapshot);
  }

  return runDirtyAutobranchFlow(ctx, args, snapshot);
}

async function loadPendingWorktreeSnapshot(
  ctx: SdlContext,
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
      clean: status.stdout.trim().length === 0,
    },
  };
}

function execGit(ctx: SdlContext, args: string[], timeoutMs: number): Promise<ExecResult> {
  return ctx.exec("git", args, { timeoutMs });
}

function execGt(ctx: SdlContext, args: string[], timeoutMs: number): Promise<ExecResult> {
  return ctx.exec("gt", args, { timeoutMs });
}

async function runDirtyAutobranchFlow(
  ctx: SdlContext,
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
  const isClean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
  const suffix = prepared.plan.hasSuffix
    ? ` (base slug ${prepared.plan.baseSlug} was unavailable)`
    : "";

  return {
    ok: true,
    summary: [
      `New branch: ${prepared.plan.branchName}${suffix}`,
      `Stacked on: ${snapshot.branch}`,
      `Commit: ${transaction.commitSummary}`,
      isClean
        ? "Working directory is clean."
        : "Warning: working directory is not clean after checkpoint.",
    ].join("\n"),
    warnings,
  };
}

async function prepareAutobranchPlan(
  ctx: SdlContext,
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
  ctx: SdlContext,
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

async function readUntrackedSnippets(ctx: SdlContext, root: string): Promise<string> {
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
  ref: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restored = await execGit(ctx, ["stash", "pop", ref], STASH_POP_TIMEOUT_MS);
  if (restored.code !== 0) {
    return { ok: false, error: formatCommandDetails(restored) };
  }
  return { ok: true };
}

async function createLatestCommitAutobranchFlow(
  ctx: SdlContext,
  args: ParsedAutobranchArgs,
  snapshot: PendingWorktreeSnapshot,
): Promise<AutobranchFlowResult> {
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
  ctx: SdlContext,
  args: ParsedAutobranchArgs,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
): Promise<{ ok: true; children: string[] } | { ok: false; error: string }> {
  const children = await execGt(ctx, ["children", "--no-interactive"], GT_TIMEOUT_MS);
  if (children.code !== 0) {
    return { ok: false, error: formatCommandDetails(children) };
  }
  return { ok: true, children: nonEmptyLines(children.stdout) };
}

async function prepareLatestCommitSlug(
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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
  ctx: SdlContext,
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

async function inspectUpstreamHeadState(ctx: SdlContext): Promise<UpstreamHeadState> {
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

function prepareRequestedBranchSlug(slug: string | undefined): RequestedBranchSlugResult {
  if (!slug) {
    return { kind: "absent" };
  }
  const requestedSlug = sanitizeBranchName(slug);
  if (!requestedSlug) {
    return { kind: "invalid_requested_slug", requestedSlug: slug };
  }
  return { kind: "slug", baseSlug: requestedSlug, source: "requested" };
}

function buildBranchSlugPrompt(input: BranchSlugPromptInput): string {
  const lines: string[] = [input.intro];
  if (input.inference) {
    lines.push(input.inference);
  }
  lines.push("Rules:", ...BRANCH_SLUG_RULES, "");
  for (const section of input.evidenceSections) {
    const trimmedContent = section.content.trim();
    const content = trimmedContent.length > 0 ? trimmedContent : (section.emptyText ?? "");
    lines.push(
      `## ${section.heading}`,
      section.maxChars === undefined ? content : truncateText(content, section.maxChars),
    );
  }
  return lines.join("\n");
}

async function deriveBranchSlug(ctx: SdlContext, prompt: string): Promise<BranchSlugModelResult> {
  const resolution = resolveModelRef(ctx.env, SLUG_MODEL_ENV, DEFAULT_FAST_MODEL_REF);
  if (!resolution.ok) {
    return { ok: false, formattedFailure: resolution.error };
  }
  const model = resolution.value;
  const args = buildSlugModelArgs(prompt, model);
  const displayCommand = formatCommand("pi", [...args.slice(0, -1), "<slug-prompt>"]);

  let hasRetriedKilledResult = false;
  for (let attempt = 1; ; attempt += 1) {
    const result = await ctx.exec("pi", args, { timeoutMs: SLUG_MODEL_TIMEOUT_MS });
    if (result.killed && attempt < SLUG_MODEL_MAX_ATTEMPTS) {
      hasRetriedKilledResult = true;
      continue;
    }

    if (result.code !== 0 || result.killed) {
      const status = result.killed
        ? `exit code ${result.code}; process was killed or timed out`
        : `exit code ${result.code}`;
      return {
        ok: false,
        formattedFailure: [
          `Pi slug model command failed (${status}).`,
          ...(hasRetriedKilledResult ? ["Retried once after a killed/timeout result."] : []),
          `Command: ${displayCommand}`,
          formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
          formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
        ].join("\n"),
      };
    }

    const rawOutput = result.stdout;
    if (rawOutput.trim().length === 0) {
      return { ok: false, formattedFailure: "Pi slug model returned empty output." };
    }

    const slug = sanitizeBranchName(rawOutput);
    if (slug === undefined) {
      return {
        ok: false,
        formattedFailure: [
          "Pi slug model output could not be normalized into a branch slug.",
          formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
        ].join("\n"),
      };
    }

    return { ok: true, baseSlug: slug, source: "model" };
  }
}

function buildSlugModelArgs(prompt: string, model: ParsedModelRef): string[] {
  return [
    "--provider",
    model.provider,
    "--model",
    model.modelId,
    "--thinking",
    SLUG_MODEL_THINKING,
    "--no-session",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-context-files",
    "--no-tools",
    "--mode",
    "text",
    "--print",
    prompt,
  ];
}

function parseModelRef(modelRef: string): ParsedModelRef | undefined {
  const separator = modelRef.indexOf("/");
  if (separator <= 0 || separator === modelRef.length - 1) {
    return undefined;
  }
  return { provider: modelRef.slice(0, separator), modelId: modelRef.slice(separator + 1) };
}

function resolveModelRef(
  env: Record<string, string | undefined>,
  envVar: string,
  defaultRef: string,
): { ok: true; value: ParsedModelRef } | { ok: false; error: string } {
  const modelRef = env[envVar]?.trim() || defaultRef;
  const parsed = parseModelRef(modelRef);
  if (parsed === undefined) {
    return {
      ok: false,
      error: `Invalid ${envVar}=${JSON.stringify(modelRef)}. Expected "provider/modelId".`,
    };
  }
  return { ok: true, value: parsed };
}

async function chooseAvailableBranchName(
  ctx: SdlContext,
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

async function findAvailableBranchName<TName extends string>(
  ctx: SdlContext,
  candidates: Iterable<{ name: TName; hasSuffix: boolean }>,
): Promise<({ ok: true } & AvailableBranchName & { name: TName }) | undefined> {
  for (const candidate of candidates) {
    const valid = await execGit(
      ctx,
      ["check-ref-format", "--branch", candidate.name],
      GIT_FACT_TIMEOUT_MS,
    );
    if (valid.code !== 0) continue;
    const exists = await execGit(
      ctx,
      ["show-ref", "--verify", "--quiet", `refs/heads/${candidate.name}`],
      GIT_FACT_TIMEOUT_MS,
    );
    if (exists.code !== 0) {
      return { ok: true, name: candidate.name, hasSuffix: candidate.hasSuffix };
    }
  }
  return undefined;
}

function* branchNameCandidates<TName extends string>(
  nameBuilder: (index: number, suffix: string) => TName,
): Iterable<{ name: TName; hasSuffix: boolean }> {
  for (let index = 0; index < 50; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    yield { name: nameBuilder(index, suffix), hasSuffix: index > 0 };
  }
}

function normalizeBranchSlugText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeBranchName(value: string): string | undefined {
  const firstLine = value
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?|```/g, ""))
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return undefined;
  return finalizeBranchSlug(normalizeBranchSlugText(firstLine));
}

function trimBranchSlugToLength(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).replace(/[-/]+$/g, "");
}

function finalizeBranchSlug(value: string): string | undefined {
  const withoutPlanSuffix = value.replace(/(?:-plan)+$/g, "").replace(/^-|-$/g, "");
  if (!withoutPlanSuffix) return undefined;
  const trimmed = trimBranchSlugToLength(withoutPlanSuffix, MAX_BRANCH_SLUG_LENGTH)
    .replace(/(?:-plan)+$/g, "")
    .replace(/^-|-$/g, "");
  return trimmed || undefined;
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

function formatCommandDetails(result: ExecResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  const killed = result.killed ? " (killed or timed out)" : "";
  return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(formatShellArg).join(" ");
}

function formatShellArg(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function formatOutputSection(
  name: "stdout" | "stderr",
  output: string,
  options: { maxChars: number; maxLines?: number },
): string {
  const normalizedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n").trimEnd();
  const tail = normalizedOutput.length > 0 ? tailText(normalizedOutput, options) : "";
  return [`----- ${name} tail -----`, tail.length > 0 ? tail : "(empty)"].join("\n");
}

function tailText(text: string, options: { maxChars: number; maxLines?: number }): string {
  const maxChars = Math.max(0, Math.trunc(options.maxChars));
  const lineLimited = applyLineLimit(text, options.maxLines);
  let tail = lineLimited.text;
  if (tail.length > maxChars) {
    tail = maxChars === 0 ? "…" : `…${tail.slice(-maxChars)}`;
  }
  if (lineLimited.omittedLines > 0) {
    return `… ${lineLimited.omittedLines} earlier line(s) omitted\n${tail}`;
  }
  return tail;
}

function applyLineLimit(
  text: string,
  maxLines: number | undefined,
): { text: string; omittedLines: number } {
  if (maxLines === undefined) {
    return { text, omittedLines: 0 };
  }
  const normalizedMaxLines = Math.max(0, Math.trunc(maxLines));
  const lines = text.split("\n");
  if (lines.length <= normalizedMaxLines) {
    return { text, omittedLines: 0 };
  }
  if (normalizedMaxLines === 0) {
    return { text: "", omittedLines: lines.length };
  }
  return {
    text: lines.slice(-normalizedMaxLines).join("\n"),
    omittedLines: lines.length - normalizedMaxLines,
  };
}

function stripTerminalEscapes(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function nonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
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
  ctx: SdlContext,
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

function buildCheckpointDiffPromptSection(input: {
  diff: string;
  maxChars?: number;
  perFileExcerptChars?: number;
}): CheckpointDiffPromptSection {
  const maxChars = input.maxChars ?? CHECKPOINT_DIFF_PROMPT_CHAR_LIMIT;
  const perFileExcerptChars = input.perFileExcerptChars ?? CHECKPOINT_PER_FILE_EXCERPT_CHAR_LIMIT;
  const trimmedDiff = input.diff.trimEnd();
  if (trimmedDiff.trim().length === 0) {
    return { text: "(no tracked diff; rely on untracked filenames in status)", isCompacted: false };
  }
  if (trimmedDiff.length <= maxChars) {
    return { text: trimmedDiff, isCompacted: false };
  }

  const fileSections = parseDiffFileSections(trimmedDiff);
  if (fileSections.length === 0) {
    return { text: buildHeadTailCompactedDiff(trimmedDiff, maxChars), isCompacted: true };
  }

  return {
    text: buildFileSectionCompactedDiff({
      diff: trimmedDiff,
      fileSections,
      maxChars,
      perFileExcerptChars,
    }),
    isCompacted: true,
  };
}

function parseDiffFileSections(diff: string): DiffFileSection[] {
  const headers = [...diff.matchAll(/^diff --git .*$/gm)];
  return headers.map((header, index) => {
    const start = header.index ?? 0;
    const next = headers[index + 1];
    const end = next?.index ?? diff.length;
    const text = diff.slice(start, end).trimEnd();
    return { path: parseDiffHeaderPath(header[0]), text };
  });
}

function parseDiffHeaderPath(header: string): string {
  const match = header.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!match) return header.replace(/^diff --git\s+/, "");
  const before = match[1] ?? "";
  const after = match[2] ?? "";
  return before === after ? after : `${before} -> ${after}`;
}

function buildFileSectionCompactedDiff(input: {
  diff: string;
  fileSections: readonly DiffFileSection[];
  maxChars: number;
  perFileExcerptChars: number;
}): string {
  const paths = input.fileSections.map((section) => section.path);
  let output = `Large diff compacted for checkpoint message generation.\nOriginal diff character count: ${input.diff.length}\nDetected file sections: ${input.fileSections.length}\n\n${buildChangedPathList(paths)}\n\nPer-file excerpts:\n`;
  let omittedFileSections = 0;
  let omittedCharacters = 0;
  let includedFileSections = 0;

  for (const section of input.fileSections) {
    const remainingChars = input.maxChars - output.length - CHECKPOINT_FINAL_SUMMARY_RESERVE_CHARS;
    const blockOverhead = `\n### ${section.path}\n\n\`\`\`diff\n\n\`\`\`\n`.length + 80;
    const availableExcerptChars = Math.min(
      input.perFileExcerptChars,
      remainingChars - blockOverhead,
    );
    if (availableExcerptChars <= 0) {
      omittedFileSections += 1;
      omittedCharacters += section.text.length;
      continue;
    }
    const excerpt = section.text.slice(0, availableExcerptChars).trimEnd();
    const omittedFromSection = section.text.length - excerpt.length;
    omittedCharacters += omittedFromSection;
    includedFileSections += 1;
    const omission =
      omittedFromSection > 0
        ? `\n[... omitted ${omittedFromSection} chars from this file ...]`
        : "";
    output += `\n### ${section.path}\n\n\`\`\`diff\n${excerpt}${omission}\n\`\`\`\n`;
  }

  output += `\nOmitted summary: ${omittedFileSections} file sections not excerpted; ${omittedCharacters} characters omitted from excerpted or omitted file sections; ${includedFileSections} file sections excerpted.\n`;
  return truncateTextHead({
    value: output,
    maxChars: input.maxChars,
    buildMarker: () => "\n[... compacted checkpoint diff section truncated to prompt budget ...]\n",
  });
}

function buildChangedPathList(paths: readonly string[]): string {
  let output = `Changed paths (showing 0 of ${paths.length}):`;
  let shown = 0;
  for (const path of paths.slice(0, CHECKPOINT_CHANGED_PATH_LIMIT)) {
    const line = `\n- ${path}`;
    if (output.length + line.length > CHECKPOINT_CHANGED_PATH_CHAR_LIMIT) break;
    output += line;
    shown += 1;
  }
  if (shown < paths.length) {
    output += `\n- ... omitted ${paths.length - shown} more paths`;
  }
  return output.replace(`showing 0 of ${paths.length}`, `showing ${shown} of ${paths.length}`);
}

function buildHeadTailCompactedDiff(diff: string, maxChars: number): string {
  const omittedChars = diff.length - maxChars;
  const marker = buildNoFileSectionCompactionMarker(omittedChars);
  const header = `Large diff compacted for checkpoint message generation.\nOriginal diff character count: ${diff.length}\nDetected file sections: 0\nNo diff --git file sections were detected; using head/tail excerpt.\n\n\`\`\`diff\n`;
  const footer = "\n```\n";
  const excerptBudget = Math.max(0, maxChars - header.length - marker.length - footer.length);
  const excerpt = truncateTextHeadTail({
    value: diff,
    maxChars: excerptBudget + marker.length,
    headRatio: 0.5,
    headRounding: "ceil",
    shouldTrimHead: true,
    shouldTrimTail: true,
    buildMarker: buildNoFileSectionCompactionMarker,
  });
  return `${header}${excerpt}${footer}`;
}

function buildNoFileSectionCompactionMarker(omittedChars: number): string {
  return `\n[... omitted ${omittedChars} chars from compacted diff without file sections ...]\n`;
}

function compactPromptText(value: string, maxChars: number, label: string): string {
  return truncateTextHead({
    value,
    maxChars,
    shouldTrimInput: true,
    buildMarker: (omittedChars) => `\n[... omitted ${omittedChars} chars from ${label} ...]\n`,
  });
}

function truncateTextHead(options: TruncateTextOptions): string {
  const value = options.shouldTrimInput ? options.value.trim() : options.value;
  if (value.length <= options.maxChars) return value;
  const marker = options.buildMarker(value.length - options.maxChars);
  if (marker.length >= options.maxChars) return marker.slice(0, options.maxChars);
  return `${value.slice(0, options.maxChars - marker.length).trimEnd()}${marker}`;
}

function truncateTextHeadTail(options: TruncateTextHeadTailOptions): string {
  const value = options.shouldTrimInput ? options.value.trim() : options.value;
  if (value.length <= options.maxChars) return value;
  const marker = options.buildMarker(value.length - options.maxChars);
  if (marker.length >= options.maxChars) return marker.slice(0, options.maxChars);
  const excerptChars = options.maxChars - marker.length;
  const rawHeadChars = excerptChars * options.headRatio;
  const headChars =
    options.headRounding === "ceil" ? Math.ceil(rawHeadChars) : Math.floor(rawHeadChars);
  const tailChars = Math.max(0, excerptChars - headChars);
  const head = value.slice(0, headChars);
  const tail = value.slice(value.length - tailChars);
  return `${options.shouldTrimHead ? head.trimEnd() : head}${marker}${options.shouldTrimTail ? tail.trimStart() : tail}`;
}

function promptBlock(value: string, emptyPlaceholder: string): string {
  return value.trim().length === 0 ? emptyPlaceholder : value.trimEnd();
}

function validateCheckpointMessage(output: string): CheckpointValidationResult {
  const normalizedText = normalizeCheckpointDraft(output);
  const issues = collectCheckpointIssues(normalizedText);
  if (issues.length > 0) {
    return { ok: false, normalizedText, issues };
  }

  return { ok: true, message: buildCheckpointMessage(normalizedText) };
}

function normalizeCheckpointDraft(output: string): string {
  const withoutCarriageReturns = output.replace(/\r\n?/g, "\n");
  const trimmed = trimOuterBlankLines(withoutCarriageReturns);
  return stripOuterCodeFence(trimmed);
}

function formatCheckpointMessage(message: CheckpointMessage): string {
  return [message.subject, "", ...message.bullets].join("\n");
}

function formatCheckpointValidationFeedback(issues: readonly CheckpointMessageIssue[]): string {
  return issues.map(formatIssue).join("\n");
}

function formatIssue(issue: CheckpointMessageIssue): string {
  switch (issue.code) {
    case "missing_subject":
      return "- missing_subject: first non-blank line must be the [cp] subject";
    case "missing_blank_line":
      return "- missing_blank_line: subject must be followed by exactly one blank separator line";
    case "missing_cp_prefix":
      return `- missing_cp_prefix: subject must start with "[cp] "; found ${JSON.stringify(issue.subject)}`;
    case "subject_too_long":
      return `- subject_too_long: length ${issue.length}, max ${issue.maxLength}: ${JSON.stringify(issue.subject)}`;
    case "subject_trailing_period":
      return `- subject_trailing_period: remove trailing period from ${JSON.stringify(issue.subject)}`;
    case "no_bullets":
      return "- no_bullets: include 1 to 3 bullet lines after the blank line";
    case "too_many_bullets":
      return `- too_many_bullets: found ${issue.count}, max ${issue.maxCount}`;
    case "invalid_bullet_prefix":
      return `- invalid_bullet_prefix: line ${issue.lineNumber} must start with "- "; found ${JSON.stringify(issue.line)}`;
    case "extra_prose":
      return `- extra_prose: line ${issue.lineNumber} is outside the checkpoint message structure: ${JSON.stringify(issue.line)}`;
    case "code_fence":
      return "- code_fence: return only the commit message, without markdown fences";
    case "trailer":
      return `- trailer: line ${issue.lineNumber} looks like a commit trailer and is not allowed: ${JSON.stringify(issue.line)}`;
  }
}

function collectCheckpointIssues(normalizedText: string): CheckpointMessageIssue[] {
  const lines = normalizedText.split("\n").map((line) => line.trimEnd());
  const issues: CheckpointMessageIssue[] = [];

  if (normalizedText.trim().length === 0) {
    return [{ code: "missing_subject" }, { code: "no_bullets" }];
  }

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      pushUniqueCodeFence(issues);
    }
  }

  const subjectIndex = findSubjectIndex(lines);
  for (let index = 0; index < subjectIndex; index += 1) {
    if (lines[index]?.trim()) {
      issues.push({ code: "extra_prose", lineNumber: index + 1, line: lines[index] ?? "" });
    }
  }

  const subject = lines[subjectIndex] ?? "";
  if (!subject.trim()) {
    issues.push({ code: "missing_subject" });
  } else {
    if (!subject.startsWith("[cp] ")) {
      issues.push({ code: "missing_cp_prefix", subject });
    }
    if (subject.length > CHECKPOINT_SUBJECT_MAX_LENGTH) {
      issues.push({
        code: "subject_too_long",
        length: subject.length,
        maxLength: CHECKPOINT_SUBJECT_MAX_LENGTH,
        subject,
      });
    }
    if (subject.endsWith(".")) {
      issues.push({ code: "subject_trailing_period", subject });
    }
  }

  const blankLineIndex = subjectIndex + 1;
  const hasBlankLine = lines[blankLineIndex] === "";
  if (!hasBlankLine) {
    issues.push({ code: "missing_blank_line" });
  }

  const bodyStart = hasBlankLine ? blankLineIndex + 1 : blankLineIndex;
  const bodyLines = lines.slice(bodyStart);
  let bulletCount = 0;
  for (let offset = 0; offset < bodyLines.length; offset += 1) {
    const lineNumber = bodyStart + offset + 1;
    const line = bodyLines[offset] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      issues.push({ code: "extra_prose", lineNumber, line });
      continue;
    }
    if (trimmed.startsWith("```")) {
      pushUniqueCodeFence(issues);
      continue;
    }
    if (isTrailerLine(trimmed)) {
      issues.push({ code: "trailer", lineNumber, line });
      continue;
    }
    if (line.startsWith("- ")) {
      bulletCount += 1;
      continue;
    }
    if (line.startsWith("-")) {
      issues.push({ code: "invalid_bullet_prefix", lineNumber, line });
      continue;
    }
    issues.push({ code: "extra_prose", lineNumber, line });
  }

  if (bulletCount === 0) {
    issues.push({ code: "no_bullets" });
  }
  if (bulletCount > CHECKPOINT_MAX_BULLETS) {
    issues.push({ code: "too_many_bullets", count: bulletCount, maxCount: CHECKPOINT_MAX_BULLETS });
  }

  return issues;
}

function buildCheckpointMessage(normalizedText: string): CheckpointMessage {
  const lines = normalizedText.split("\n").map((line) => line.trimEnd());
  const subjectIndex = findSubjectIndex(lines);
  const subject = lines[subjectIndex] ?? "";
  const blankLineIndex = subjectIndex + 1;
  const bodyStart = lines[blankLineIndex] === "" ? blankLineIndex + 1 : blankLineIndex;
  return { subject, bullets: lines.slice(bodyStart) };
}

function trimOuterBlankLines(text: string): string {
  const lines = text.split("\n");
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1]?.trim() === "") {
    end -= 1;
  }
  return lines.slice(start, end).join("\n");
}

function stripOuterCodeFence(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 2) {
    return text;
  }
  const firstLine = lines[0]?.trim() ?? "";
  const lastLine = lines[lines.length - 1]?.trim() ?? "";
  if (!/^```[a-zA-Z0-9_-]*$/.test(firstLine) || lastLine !== "```") {
    return text;
  }
  return trimOuterBlankLines(lines.slice(1, -1).join("\n"));
}

function findSubjectIndex(lines: readonly string[]): number {
  const prefixedIndex = lines.findIndex((line) => line.startsWith("[cp] "));
  return prefixedIndex >= 0 ? prefixedIndex : 0;
}

function pushUniqueCodeFence(issues: CheckpointMessageIssue[]): void {
  if (!issues.some((issue) => issue.code === "code_fence")) {
    issues.push({ code: "code_fence" });
  }
}

function isTrailerLine(line: string): boolean {
  return /^[A-Za-z][A-Za-z0-9-]*: .+/.test(line);
}
