import type { SdlExtensionApi } from "@sdl/sdl/sdk";

import { execGit } from "./worktree.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;
export const DEFAULT_FAST_MODEL_REF = "openai-codex/gpt-5.4-mini";
export const SLUG_MODEL_ENV = "SDL_SLUG_MODEL";
const SLUG_MODEL_TIMEOUT_MS = 60_000;
const SLUG_MODEL_THINKING = "minimal";
const SLUG_MODEL_MAX_ATTEMPTS = 2;
const MAX_ERROR_CHARS = 4_000;
const MAX_BRANCH_SLUG_LENGTH = 50;
export const MAX_DIFF_CHARS = 24_000;

export type RequestedBranchSlugResult =
  | { kind: "absent" }
  | { kind: "slug"; baseSlug: string; source: "requested" }
  | { kind: "invalid_requested_slug"; requestedSlug: string };

export interface BranchSlugEvidenceSection {
  heading: string;
  content: string;
  emptyText?: string;
  maxChars?: number;
}

export interface BranchSlugPromptInput {
  intro: string;
  inference?: string;
  evidenceSections: readonly BranchSlugEvidenceSection[];
}

export type BranchSlugModelResult =
  | { ok: true; baseSlug: string; source: "model" }
  | { ok: false; formattedFailure: string };

export interface AvailableBranchName {
  name: string;
  hasSuffix: boolean;
}


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

export function prepareRequestedBranchSlug(slug: string | undefined): RequestedBranchSlugResult {
  if (!slug) {
    return { kind: "absent" };
  }
  const requestedSlug = sanitizeBranchName(slug);
  if (!requestedSlug) {
    return { kind: "invalid_requested_slug", requestedSlug: slug };
  }
  return { kind: "slug", baseSlug: requestedSlug, source: "requested" };
}

export function buildBranchSlugPrompt(input: BranchSlugPromptInput): string {
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

export async function deriveBranchSlug(ctx: SdlExtensionApi, prompt: string): Promise<BranchSlugModelResult> {
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

export async function chooseAvailableBranchName(
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

export async function findAvailableBranchName<TName extends string>(
  ctx: SdlExtensionApi,
  candidates: Iterable<{ name: TName; hasSuffix: boolean }>,
): Promise<({ ok: true } & AvailableBranchName & { name: TName }) | undefined> {
  for (const candidate of candidates) {
    const availability = await inspectBranchNameAvailability(ctx, candidate.name);
    if (availability === "available") {
      return { ok: true, name: candidate.name, hasSuffix: candidate.hasSuffix };
    }
  }
  return undefined;
}

async function inspectBranchNameAvailability(
  ctx: SdlExtensionApi,
  candidate: string,
): Promise<"available" | "unavailable"> {
  const valid = await execGit(ctx, ["check-ref-format", "--branch", candidate], GIT_FACT_TIMEOUT_MS);
  if (valid.code !== 0) return "unavailable";

  const exact = await execGit(
    ctx,
    ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`],
    GIT_FACT_TIMEOUT_MS,
  );
  if (exact.code === 0) return "unavailable";
  if (exact.code !== 1) return "unavailable";

  for (const prefix of branchRefParentPrefixes(candidate)) {
    const parent = await execGit(
      ctx,
      ["show-ref", "--verify", "--quiet", `refs/heads/${prefix}`],
      GIT_FACT_TIMEOUT_MS,
    );
    if (parent.code === 0) return "unavailable";
    if (parent.code !== 1) return "unavailable";
  }

  const childRefs = await execGit(
    ctx,
    ["for-each-ref", "--format=%(refname:strip=2)", `refs/heads/${candidate}/*`],
    GIT_FACT_TIMEOUT_MS,
  );
  if (childRefs.code !== 0) return "unavailable";
  if (childRefs.stdout.trim().length > 0) return "unavailable";

  return "available";
}

function branchRefParentPrefixes(candidate: string): string[] {
  const segments = candidate.split("/");
  const prefixes: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    prefixes.push(segments.slice(0, index).join("/"));
  }
  return prefixes;
}

export function* branchNameCandidates<TName extends string>(
  nameBuilder: (index: number, suffix: string) => TName,
): Iterable<{ name: TName; hasSuffix: boolean }> {
  for (let index = 0; index < 50; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    yield { name: nameBuilder(index, suffix), hasSuffix: index > 0 };
  }
}

export function normalizeBranchSlugText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function sanitizeBranchName(value: string): string | undefined {
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


export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function nonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

