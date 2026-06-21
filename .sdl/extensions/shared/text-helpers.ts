import { basename } from "node:path";

import {
  normalizeTextOutput,
  trimOuterBlankLines,
  truncateTextHeadTail,
  type TextGenerator,
} from "@sdl/sdl/sdk";

const MAX_REPAIR_ATTEMPTS = 2;
const DEFAULT_ATTEMPT_PROGRESS_HEARTBEAT_MS = 5_000;

export type RepairProgressEvent =
  | { type: "attempt_started"; attempt: number; maxAttempts: number }
  | { type: "attempt_waiting"; attempt: number; maxAttempts: number; elapsedMs: number }
  | { type: "attempt_invalid"; attempt: number; maxAttempts: number; feedback: string };

export type TextValidationResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; feedback: string };

export async function prepareRepairedText<TValue>(options: {
  noun: string;
  initialPrompt: string;
  generate: (prompt: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  validate: (text: string) => TextValidationResult<TValue>;
  buildRepairPrompt: (input: {
    initialPrompt: string;
    previousDraft: string;
    feedback: string;
  }) => string;
  onProgress?: (event: RepairProgressEvent) => void;
}): Promise<{ ok: true; value: TValue; source: "model" | "repaired_model"; feedback?: string } | { ok: false; error: string }> {
  let prompt = options.initialPrompt;
  let firstFeedback: string | undefined;
  let latestFeedback = "";

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    options.onProgress?.({ type: "attempt_started", attempt, maxAttempts: MAX_REPAIR_ATTEMPTS });
    const stopWaitingProgress = startAttemptProgressHeartbeat(options.onProgress, attempt, MAX_REPAIR_ATTEMPTS);
    let generated: { ok: true; text: string } | { ok: false; error: string };
    try {
      generated = await options.generate(prompt);
    } finally {
      stopWaitingProgress?.();
    }
    if (!generated.ok) return { ok: false, error: generated.error };

    const validation = options.validate(generated.text);
    if (validation.ok) {
      return {
        ok: true,
        value: validation.value,
        source: attempt === 1 ? "model" : "repaired_model",
        ...(firstFeedback === undefined ? {} : { feedback: firstFeedback }),
      };
    }

    latestFeedback = validation.feedback;
    firstFeedback ??= latestFeedback;
    if (attempt < MAX_REPAIR_ATTEMPTS) {
      options.onProgress?.({
        type: "attempt_invalid",
        attempt,
        maxAttempts: MAX_REPAIR_ATTEMPTS,
        feedback: validation.feedback,
      });
      prompt = options.buildRepairPrompt({
        initialPrompt: options.initialPrompt,
        previousDraft: generated.text,
        feedback: validation.feedback,
      });
    }
  }

  return {
    ok: false,
    error: `Model produced an invalid ${options.noun} after ${MAX_REPAIR_ATTEMPTS} attempts.\n${latestFeedback}`,
  };
}

function startAttemptProgressHeartbeat(
  onProgress: ((event: RepairProgressEvent) => void) | undefined,
  attempt: number,
  maxAttempts: number,
): (() => void) | undefined {
  if (onProgress === undefined) return undefined;
  let elapsedMs = 0;
  const timer = setInterval(() => {
    elapsedMs += DEFAULT_ATTEMPT_PROGRESS_HEARTBEAT_MS;
    onProgress({ type: "attempt_waiting", attempt, maxAttempts, elapsedMs });
  }, DEFAULT_ATTEMPT_PROGRESS_HEARTBEAT_MS);
  return () => clearInterval(timer);
}

const CHANGES_SUMMARY_MAX_BULLETS = 4;
const CHANGES_SUMMARY_MAX_TOKENS = 512;
const INVALID_SUMMARY_ERROR =
  'Model returned an invalid changes summary (expected 1–4 "- " bullets, no headers or code fences).';

interface PendingWorktreeSnapshot {
  branch: string;
  status: string;
  diff: string;
}

export const CHANGES_SUMMARY_SYSTEM_PROMPT = `You summarize a coding agent's outstanding worktree changes for a reviewer.

Given git status and diff, output a short bullet summary:
- Output 1 to 4 bullet lines, each starting with "- ".
- No subject line, no "[cp]" prefix, no commit-message format.
- No prose paragraphs, no markdown headers, no code fences, no trailers.
- Group related files into a single bullet instead of listing every file separately.
- Untracked file contents are not provided. Name untracked files only; never claim to have read their contents.
- Optimize for a reviewer scanning the worktree to understand what changed.`;

export async function draftChangesSummary(input: {
  textGenerator: TextGenerator;
  env: Record<string, string | undefined>;
  snapshot: Pick<PendingWorktreeSnapshot, "branch" | "status" | "diff">;
  modelRef: string;
}): Promise<{ ok: true; summaryText: string } | { ok: false; error: string }> {
  const drafted = await input.textGenerator.generateText({
    modelRef: input.modelRef,
    system: CHANGES_SUMMARY_SYSTEM_PROMPT,
    prompt: buildChangesUserPrompt(input.snapshot),
    maxTokens: CHANGES_SUMMARY_MAX_TOKENS,
    reasoning: "low",
    operation: "changes-summary",
  });
  if (!drafted.ok) {
    return { ok: false, error: drafted.error };
  }

  return validateChangesSummary(drafted.text);
}

function buildChangesUserPrompt(
  snapshot: Pick<PendingWorktreeSnapshot, "branch" | "status" | "diff">,
): string {
  return `Summarize the outstanding changes in this worktree for a reviewer.\n\n## branch\n\n${snapshot.branch}\n\n## git status --porcelain=v1\n\n${snapshot.status.trim() || "(clean)"}\n\n## git diff HEAD\n\n${snapshot.diff.trim() || "(no tracked diff; rely on untracked filenames in status)"}\n`;
}

function validateChangesSummary(
  output: string,
): { ok: true; summaryText: string } | { ok: false; error: string } {
  const normalized = normalizeTextOutput(output);
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

const PR_DESCRIPTION_GENERATOR_VERSION = "sdl-pr-description-v2";
const PR_DESCRIPTION_MAX_DIFF_CHARS = 120_000;
const LOCKFILE_BASENAMES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "uv.lock",
  "poetry.lock",
  "Cargo.lock",
]);

export type PrCommitMessage = { headline: string; body?: string };

export type PrDescriptionPromptContext =
  | {
      kind: "github";
      number: number;
      url: string;
      title: string;
      headRefName: string;
      baseRefName: string;
      commitMessages?: readonly PrCommitMessage[];
      diff: string;
    }
  | {
      kind: "local";
      title: string;
      headRefName: string;
      baseRefName: string;
      commitMessages?: readonly PrCommitMessage[];
      diff: string;
    };

type PreparedPrDescription =
  | { ok: true; title: string; body: string; source: "model" | "repaired_model"; feedback?: string }
  | { ok: false; error: string };

type PrDescriptionValidationIssue =
  | { type: "empty_title" }
  | { type: "title_too_long"; length: number; maxLength: number }
  | { type: "empty_body" }
  | { type: "attribution_footer"; text: string };

export async function preparePrDescription(input: {
  textGenerator: TextGenerator;
  modelRef: string;
  promptText: string;
  context: PrDescriptionPromptContext;
  onProgress?: (message: string) => void;
}): Promise<PreparedPrDescription> {
  const firstPrompt = buildPrDescriptionUserPrompt(input.context);
  const prepared = await prepareRepairedText({
    noun: "PR description",
    initialPrompt: firstPrompt,
    generate: (prompt) => generatePrDescriptionText(input.textGenerator, input.modelRef, input.promptText, prompt),
    validate: (text) => {
      const validation = parsePrDescriptionOutput(text);
      if (validation.ok) return { ok: true, value: validation.description };
      return { ok: false, feedback: formatPrDescriptionValidationFeedback(validation.issues) };
    },
    buildRepairPrompt: ({ initialPrompt, previousDraft, feedback }) => `${initialPrompt}
## previous invalid draft

${previousDraft.trim()}

## validation feedback

${feedback}

Rewrite the PR title and body so it satisfies every validation rule. Return only the corrected PR title and body.
`,
    onProgress: (event) => {
      switch (event.type) {
        case "attempt_started":
          input.onProgress?.(`generating PR metadata (attempt ${event.attempt}/${event.maxAttempts})`);
          break;
        case "attempt_waiting":
          input.onProgress?.(`still generating PR metadata (${formatElapsedMs(event.elapsedMs)} elapsed)`);
          break;
        case "attempt_invalid":
          input.onProgress?.("PR metadata draft failed validation; requesting repair");
          break;
      }
    },
  });
  if (!prepared.ok) return prepared;
  return {
    ok: true,
    title: prepared.value.title,
    body: prepared.value.body,
    source: prepared.source,
    ...(prepared.feedback === undefined ? {} : { feedback: prepared.feedback }),
  };
}

function generatePrDescriptionText(
  textGenerator: TextGenerator,
  modelRef: string,
  system: string,
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  return textGenerator.generateText({
    modelRef,
    system,
    prompt,
    maxTokens: 2048,
    reasoning: "low",
    operation: "pr-description",
  });
}

function buildPrDescriptionUserPrompt(input: PrDescriptionPromptContext): string {
  const context = [
    "## Context",
    "",
    ...formatPrContextLines(input),
    `- Head branch: ${input.headRefName}`,
    `- Base branch: ${input.baseRefName}`,
  ].join("\n");
  const commitMessages = formatCommitMessages(input.commitMessages ?? []);
  const diff = truncateDiff(filterLockfileSections(input.diff));
  const sections = [context];
  if (commitMessages !== "") {
    sections.push(`## Commit Messages\n\n${commitMessages}`);
  }
  sections.push(
    `## Diff\n\n\`\`\`diff\n${diff.trimEnd()}\n\`\`\``,
    "Generate a fresh PR title and body for this diff. Do not preserve an existing PR title unless the diff independently supports it:",
  );
  return `${sections.join("\n\n")}\n`;
}

function parsePrDescriptionOutput(text: string):
  | { ok: true; description: { title: string; body: string } }
  | { ok: false; issues: PrDescriptionValidationIssue[] } {
  const normalized = normalizeTextOutput(text);
  const lines = normalized.split("\n");
  const titleIndex = lines.findIndex((line) => line.trim() !== "");
  const title = titleIndex === -1 ? "" : lines[titleIndex]?.trim() ?? "";
  const body = titleIndex === -1 ? "" : trimOuterBlankLines(lines.slice(titleIndex + 1).join("\n"));
  return validatePrDescription({ title, body });
}

function validatePrDescription(description: { title: string; body: string }):
  | { ok: true; description: { title: string; body: string } }
  | { ok: false; issues: PrDescriptionValidationIssue[] } {
  const issues: PrDescriptionValidationIssue[] = [];
  if (description.title.trim() === "") issues.push({ type: "empty_title" });
  if (description.title.length > 120) {
    issues.push({ type: "title_too_long", length: description.title.length, maxLength: 120 });
  }
  if (description.body.trim() === "") issues.push({ type: "empty_body" });
  for (const line of description.body.split("\n")) {
    if (/Generated with|Co-Authored-By/i.test(line)) {
      issues.push({ type: "attribution_footer", text: line.trim() });
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, description: { title: description.title.trim(), body: description.body.trim() } };
}

function formatPrDescriptionValidationFeedback(issues: readonly PrDescriptionValidationIssue[]): string {
  return issues.map(formatPrDescriptionValidationIssue).join("\n");
}

function formatPrDescriptionValidationIssue(issue: PrDescriptionValidationIssue): string {
  switch (issue.type) {
    case "empty_title":
      return "- Title is empty.";
    case "title_too_long":
      return `- Title is ${issue.length} characters; maximum is ${issue.maxLength}.`;
    case "empty_body":
      return "- Body is empty.";
    case "attribution_footer":
      return `- Body contains an attribution footer: ${issue.text}`;
  }
}

function filterLockfileSections(diff: string): string {
  const sections = diff.split(/(?=^diff --git )/m);
  return sections.filter((section) => !isLockfileDiffSection(section)).join("");
}

function truncateDiff(diff: string, maxChars = PR_DESCRIPTION_MAX_DIFF_CHARS): string {
  return truncateTextHeadTail({
    value: diff,
    maxChars,
    headRatio: 0.7,
    buildMarker: (omittedChars) => `\n[... TRUNCATED ${omittedChars} chars ...]\n`,
  });
}

function formatPrContextLines(input: PrDescriptionPromptContext): string[] {
  switch (input.kind) {
    case "github":
      return [
        `- PR: #${input.number} (${input.url})`,
        `- Current PR title (stale context only; regenerate from the diff): ${input.title}`,
      ];
    case "local":
      return [
        "- PR: not yet created; generate initial metadata for Graphite submit",
        `- Title source (commit headline): ${input.title}`,
      ];
  }
}

function formatElapsedMs(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCommitMessages(messages: readonly PrCommitMessage[]): string {
  return messages
    .map((message) => message.headline.trim())
    .filter((message) => message !== "")
    .join("\n\n---\n\n");
}

function isLockfileDiffSection(section: string): boolean {
  if (!section.startsWith("diff --git ")) return false;
  const firstLine = section.split("\n", 1)[0] ?? "";
  const match = firstLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (match?.[1] !== undefined && LOCKFILE_BASENAMES.has(basename(match[1]))) return true;
  if (match?.[2] !== undefined && LOCKFILE_BASENAMES.has(basename(match[2]))) return true;
  return false;
}

function promptBlock(value: string, fallback: string): string {
  const trimmed = value.trimEnd();
  return trimmed.length === 0 ? fallback : trimmed;
}
