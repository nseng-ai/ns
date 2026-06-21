import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import { prepareCheckpointMessage } from "./shared/text-helpers.ts";
import type { ExecResult, SdlExtensionApi, TextGenerator } from "@sdl/sdl/sdk";

// This project-local extension intentionally uses only the public SDL SDK import. The local
// checkpoint helpers below are SDK-pressure evidence for later command migrations, not new SDK API.
const GIT_FACT_TIMEOUT_MS = 30_000;
const GIT_COMMIT_TIMEOUT_MS = 120_000;
const GIT_LOG_TIMEOUT_MS = 5_000;
const DEFAULT_CHECKPOINT_MODEL_REF = "openai-codex/gpt-5.4-mini";
const CHECKPOINT_MODEL_ENV = "SDL_CHECKPOINT_MODEL";
const LEGACY_CHECKPOINT_MODEL_ENV = "SDL_DEV_CHECKPOINT_MODEL";
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

const CP_COMMAND_DESCRIPTION = `Create a checkpoint commit for the current diff.

The command captures the pending worktree, refuses main/master, refuses clean worktrees, asks the configured text-generation model for a validated [cp] commit message, stages all changes, commits with that message, and prints the resulting commit summary plus checkpoint message.

Use --dry-run to preview the model-authored checkpoint message without running git add, git commit, or git log.

Environment:
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
  const headChars = options.headRounding === "ceil" ? Math.ceil(rawHeadChars) : Math.floor(rawHeadChars);
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
