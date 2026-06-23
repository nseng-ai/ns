import type { SdlExtensionApi } from "@sdl/sdl/sdk";

import { MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName } from "./branch-slug-text.ts";
import { formatCommand, formatOutputSection, truncateText } from "./output.ts";

export const DEFAULT_FAST_MODEL_REF = "openai-codex/gpt-5.4-mini";
export const SLUG_MODEL_ENV = "SDL_SLUG_MODEL";
const SLUG_MODEL_TIMEOUT_MS = 60_000;
const SLUG_MODEL_THINKING = "minimal";
const SLUG_MODEL_MAX_ATTEMPTS = 2;
const MAX_ERROR_CHARS = 4_000;
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

export async function deriveBranchSlug(
  ctx: SdlExtensionApi,
  prompt: string,
): Promise<BranchSlugModelResult> {
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
