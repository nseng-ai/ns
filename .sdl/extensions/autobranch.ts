import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  checkpoint,
  defineExtension,
  failed,
  ok,
  pendingWorktree,
  textGeneration,
  type ExecResult,
  type SdkPendingWorktreeError,
  type SdkPendingWorktreeSnapshot,
  type SdlExtensionApi,
  z,
} from "@sdl/sdl/sdk";

const GIT_FACT_TIMEOUT_MS = 30_000;
const GT_CREATE_TIMEOUT_MS = 120_000;
const GT_TIMEOUT_MS = 120_000;
const STASH_PUSH_TIMEOUT_MS = 120_000;
const STASH_POP_TIMEOUT_MS = 120_000;
const DEFAULT_FAST_MODEL_REF = "openai-codex/gpt-5.4-mini";
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

const AUTOBRANCH_DESCRIPTION = `Create a Graphite branch using \`gt create\` from dirty worktree changes or from the latest eligible unpushed commit.

Dirty worktree mode stashes pending changes, creates a Graphite branch, restores the stash, and creates a checkpoint commit. Clean worktree mode moves the latest eligible unpushed non-merge commit onto a new Graphite branch using recovery-branch verification.

Environment:
  ${SLUG_MODEL_ENV}  Model reference for generated branch slugs. Defaults to ${DEFAULT_FAST_MODEL_REF}.
  ${textGeneration.CHECKPOINT_MODEL_ENV}  Model reference for generated checkpoint messages. Defaults to ${textGeneration.DEFAULT_CHECKPOINT_MODEL_REF}. Falls back to ${textGeneration.LEGACY_CHECKPOINT_MODEL_ENV} when unset.`;

const autobranchRequestSchema = z.object({
  slug: z
    .string()
    .optional()
    .describe("Branch slug to use instead of deriving one from the worktree or latest commit."),
});

type AutobranchRequest = z.output<typeof autobranchRequestSchema>;

interface ParsedAutobranchArgs {
  slug?: string;
}

interface FileStat {
  size: number;
  isFile(): boolean;
}

interface AutobranchSnapshot extends SdkPendingWorktreeSnapshot {
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
      summary: "Create a Graphite branch from dirty worktree changes or the latest unpushed commit.",
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
  const loaded = await pendingWorktree.loadSnapshot(ctx);
  if (!loaded.ok) {
    return { ok: false, error: formatAutobranchSnapshotError(loaded.error) };
  }

  const snapshot = loaded.snapshot;
  if (snapshot.isClean) {
    return createLatestCommitAutobranchFlow(ctx, args, snapshot);
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

function execGit(
  ctx: SdlExtensionApi,
  args: readonly string[],
  timeoutMs: number,
): Promise<ExecResult> {
  return ctx.exec("git", [...args], { timeoutMs });
}

function formatCommandDetails(result: ExecResult): string {
  return pendingWorktree.formatCommandDetails(result);
}

async function runDirtyAutobranchFlow(
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
  snapshot: SdkPendingWorktreeSnapshot,
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
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
  snapshot: SdkPendingWorktreeSnapshot,
): Promise<AutobranchPreparationResult> {
  const warnings: AutobranchPreparationWarning[] = [];
  const slug = await prepareBaseSlug(ctx, args, snapshot);
  if (!slug.ok) return slug;
  if (slug.warning) warnings.push(slug.warning);

  const branchName = await chooseAvailableBranchName(ctx, slug.baseSlug);
  if (!branchName.ok) {
    return { ok: false, kind: "branch_name_unavailable", baseSlug: slug.baseSlug };
  }

  const prepared = await checkpoint.prepareMessage({
    status: snapshot.status,
    diff: snapshot.diff,
    textGenerator: ctx.textGenerator,
    modelRef: textGeneration.selectCheckpointModelRef(ctx.env),
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
  snapshot: SdkPendingWorktreeSnapshot,
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

  const committed = await checkpoint.createCommit(ctx, checkpointMessage);
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

async function createLatestCommitAutobranchFlow(
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
  snapshot: SdkPendingWorktreeSnapshot,
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
  ctx: SdlExtensionApi,
  args: ParsedAutobranchArgs,
  snapshot: SdkPendingWorktreeSnapshot,
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
  snapshot: SdkPendingWorktreeSnapshot,
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

async function deriveBranchSlug(ctx: SdlExtensionApi, prompt: string): Promise<BranchSlugModelResult> {
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

async function findAvailableBranchName<TName extends string>(
  ctx: SdlExtensionApi,
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

function formatAutobranchSnapshotError(error: SdkPendingWorktreeError): string {
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

