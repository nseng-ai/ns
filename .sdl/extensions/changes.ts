import { defineExtension, failed, ok } from "@sdl/sdl/sdk";
import type { ExecResult, SdlContext } from "@sdl/sdl/sdk";

// This project-local extension intentionally uses only the public SDL SDK import. The local
// workflow helpers below are SDK-pressure evidence for later command migrations, not new SDK API.
const GIT_FACT_TIMEOUT_MS = 30_000;
const DEFAULT_CHANGES_MODEL_REF = "openai-codex/gpt-5.4-mini";
const CHANGES_MODEL_ENV = "SDL_CHANGES_MODEL";
const LEGACY_CHANGES_MODEL_ENV = "PI_DRAFT_MODEL";
const CHANGES_SUMMARY_MAX_BULLETS = 4;
const CHANGES_SUMMARY_MAX_TOKENS = 512;
const MAX_DISPLAY_FILE_LINES = 50;
const INVALID_SUMMARY_ERROR =
  'Model returned an invalid changes summary (expected 1–4 "- " bullets, no headers or code fences).';

const CHANGES_COMMAND_DESCRIPTION = `Summarize outstanding worktree changes without committing.

The command captures a pending worktree snapshot with read-only git commands. Clean worktrees print that there are no outstanding changes. Dirty worktrees ask the configured text-generation model for 1–4 reviewer-facing bullets, then print the bullets and raw porcelain status lines.

Environment:
  ${CHANGES_MODEL_ENV}  Model reference for generated changes summaries. Defaults to ${DEFAULT_CHANGES_MODEL_REF}. Falls back to ${LEGACY_CHANGES_MODEL_ENV} when unset.

The command owns human stdout/stderr, has no alternate output-format flag, and does not stage, commit, stash, switch branches, run Graphite, or call GitHub.`;

const CHANGES_SUMMARY_SYSTEM_PROMPT = `You summarize a coding agent's outstanding worktree changes for a reviewer.

Given git status and diff, output a short bullet summary:
- Output 1 to 4 bullet lines, each starting with "- ".
- No subject line, no "[cp]" prefix, no commit-message format.
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- Group related files into a single bullet instead of listing every file separately.
- Untracked file contents are not provided. Name untracked files only; never claim to have read their contents.
- Optimize for a reviewer scanning the worktree to understand what changed.`;

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

        const summary = await draftChangesSummary(ctx, snapshot);
        if (!summary.ok) {
          return failed(summary.error, 2);
        }

        return ok(formatOutstandingChangesMessage(snapshot, summary.summaryText));
      },
    },
  ],
});

async function loadPendingWorktreeSnapshot(
  ctx: SdlContext,
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

function execGit(ctx: SdlContext, args: string[]): Promise<ExecResult> {
  return ctx.exec("git", args, { timeoutMs: GIT_FACT_TIMEOUT_MS });
}

async function draftChangesSummary(
  ctx: SdlContext,
  snapshot: Pick<PendingWorktreeSnapshot, "branch" | "status" | "diff">,
): Promise<{ ok: true; summaryText: string } | { ok: false; error: string }> {
  const drafted = await ctx.textGenerator.generateText({
    modelRef: selectChangesModelRef(ctx.env),
    system: CHANGES_SUMMARY_SYSTEM_PROMPT,
    prompt: buildChangesUserPrompt(snapshot),
    maxTokens: CHANGES_SUMMARY_MAX_TOKENS,
    reasoning: "low",
    operation: "changes-summary",
  });
  if (!drafted.ok) {
    return { ok: false, error: drafted.error };
  }

  return validateChangesSummary(drafted.text);
}

function selectChangesModelRef(env: Record<string, string | undefined>): string {
  return (
    firstEnvValue(env, CHANGES_MODEL_ENV, LEGACY_CHANGES_MODEL_ENV) ?? DEFAULT_CHANGES_MODEL_REF
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

function buildChangesUserPrompt(
  snapshot: Pick<PendingWorktreeSnapshot, "branch" | "status" | "diff">,
): string {
  return `Summarize the outstanding changes in this worktree for a reviewer.\n\n## branch\n\n${snapshot.branch}\n\n## git status --porcelain=v1\n\n${snapshot.status.trim() || "(clean)"}\n\n## git diff HEAD\n\n${snapshot.diff.trim() || "(no tracked diff; rely on untracked filenames in status)"}\n`;
}

function validateChangesSummary(
  output: string,
): { ok: true; summaryText: string } | { ok: false; error: string } {
  const normalized = normalizeChangesSummary(output);
  if (normalized.trim().length === 0) {
    return { ok: false, error: INVALID_SUMMARY_ERROR };
  }

  if (normalized.includes("[cp]")) {
    return { ok: false, error: INVALID_SUMMARY_ERROR };
  }

  const nonEmptyLines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    return { ok: false, error: INVALID_SUMMARY_ERROR };
  }
  if (nonEmptyLines.some((line) => line.trim().startsWith("```"))) {
    return { ok: false, error: INVALID_SUMMARY_ERROR };
  }
  if (nonEmptyLines.some((line) => !line.startsWith("- "))) {
    return { ok: false, error: INVALID_SUMMARY_ERROR };
  }
  if (nonEmptyLines.length > CHANGES_SUMMARY_MAX_BULLETS) {
    return { ok: false, error: INVALID_SUMMARY_ERROR };
  }

  return { ok: true, summaryText: nonEmptyLines.join("\n") };
}

function normalizeChangesSummary(output: string): string {
  const withoutCarriageReturns = output.replace(/\r\n?/g, "\n");
  const trimmed = trimOuterBlankLines(withoutCarriageReturns);
  return stripOuterCodeFence(trimmed);
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
