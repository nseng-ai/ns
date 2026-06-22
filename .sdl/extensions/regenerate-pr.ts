import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

import { defineExtension, failed, ok, z } from "@sdl/sdl/sdk";
import { preparePrDescription } from "./shared/text-helpers.ts";
import type { ExecResult, SdlExtensionApi, TextGenerator } from "@sdl/sdl/sdk";

// This project-local extension intentionally uses only the public SDL SDK import. The local
// PR-description helpers below are SDK-pressure evidence for later command migrations, not new SDK API.
const DEFAULT_PR_DESCRIPTION_MODEL_REF = "openai-codex/gpt-5.4-mini";
const PR_DESCRIPTION_MODEL_ENV = "SDL_DEV_PR_DESCRIPTION_MODEL";
const PR_DESCRIPTION_PROMPT_ENV = "SDL_DEV_PR_DESCRIPTION_PROMPT";
const REPO_PR_DESCRIPTION_PROMPT_PATH = ".sdl/prompts/pr-description.md";
const GENERATED_BODY_MARKER = "<!-- generated-by: sdl-dev pr-description v1 -->";
const MANAGED_BODY_BEGIN_MARKER = "<!-- sdl-pr-description:begin";
const MANAGED_BODY_END_MARKER = "<!-- sdl-pr-description:end -->";
const PR_DESCRIPTION_GENERATOR_VERSION = "sdl-pr-description-v2";
const PR_VIEW_FIELDS = "number,url,title,body,headRefName,baseRefName";
const VIEW_TIMEOUT_MS = 30_000;
const DIFF_TIMEOUT_MS = 60_000;
const PATCH_ID_TIMEOUT_MS = 60_000;
const EDIT_TIMEOUT_MS = 60_000;
const MAX_DIFF_CHARS = 120_000;
const MAX_GENERATION_ATTEMPTS = 2;

const LOCKFILE_BASENAMES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "uv.lock",
  "poetry.lock",
  "Cargo.lock",
]);

const REGENERATE_PR_DESCRIPTION = `Regenerate the current branch PR title and SDL-managed generated body region.

The command reads the current branch PR with gh, generates fresh PR metadata from the PR diff and commit headlines, asks before editing GitHub, then updates the PR title and only the SDL-managed generated description region. Human-authored PR body text outside that managed region is preserved. The --force flag is accepted for compatibility and does not bypass confirmation.

Environment:
  ${PR_DESCRIPTION_MODEL_ENV}  Model reference for generated PR descriptions. Defaults to ${DEFAULT_PR_DESCRIPTION_MODEL_REF}.
  ${PR_DESCRIPTION_PROMPT_ENV}  Optional path to a custom PR description prompt. Overrides ${REPO_PR_DESCRIPTION_PROMPT_PATH} and the built-in prompt.`;

const DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT = `You are a pull request metadata generator. Analyze the provided git diff and return ONLY a freshly generated PR title and body.

## Analysis Principles

Analyze the diff following these principles:

- **Be concise and strategic** - focus on significant changes
- **Use component-level descriptions** - reference modules/components, not individual functions
- **Highlight breaking changes prominently**
- **Note test coverage patterns**
- **Use relative paths from repository root**

## Level of Detail

- Focus on architectural and component-level impact
- Keep "Key Changes" to 3-5 major items
- Group related changes together
- Skip minor refactoring, formatting, or trivial updates

## Output Format

[Clear one-line PR title describing the change]

[2-3 sentence summary explaining what changed and why. State what the branch does (feature/fix/refactor) and highlight key changes briefly.]

## Key Changes

- [3-5 high-level component/architectural changes]
- Strategic change description focusing on purpose and impact
- Focus on what capabilities changed, not implementation details

<details>
<summary>Files Changed</summary>

### Added (N files)
- \`path/to/file.ts\` - Brief purpose (one line)

### Modified (N files)
- \`path/to/file.ts\` - What area changed (component level)

### Deleted (N files)
- \`path/to/file.ts\` - Why removed (strategic reason)

</details>

## User Experience
[Only include this section if changes affect user-facing behavior: CLI commands, prompts, output, workflows]

**Before:** [old user experience]
**After:** [new user experience]
[Optional 1-2 sentence explanation of the improvement]

## Critical Notes
[Only if there are breaking changes, security concerns, or important warnings - 1-2 bullets max]

## Rules

- **IMPORTANT**: Output the PR title and body directly. Do NOT wrap your response in code fences or markdown blocks.
- Output ONLY the PR title and body (no preamble, no explanation, no commentary)
- NO Claude attribution or footer (NEVER add "Generated with Claude Code" or similar)
- NO metadata headers (NEVER add \`**Author:**\`, \`**Plan:**\`, \`Closes #N\`, or similar)
- Use relative paths from repository root
- Be concise (15-40 lines total, shorter if no User Experience section)
- First line = freshly generated PR title, rest = PR body
- Regenerate the title from the diff and commit messages; do not preserve an existing PR title unless the changes independently justify that exact title
- Avoid function-level details unless critical
- Maximum 5 key changes
- Only include Critical Notes if necessary`;

const regeneratePrSchema = z.object({
  force: z
    .boolean()
    .default(false)
    .describe("Compatibility no-op. Accepted for older workflows; does not bypass confirmation."),
});

type RegeneratePrRequest = z.output<typeof regeneratePrSchema>;

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

interface CommandFailure {
  code: string;
  message: string;
}

interface GithubPrDetails {
  number: number;
  url: string;
  title: string;
  body: string;
  headRefName: string;
  baseRefName: string;
}

interface PrCommitMessage {
  headline: string;
  body?: string;
}

interface StablePatchIdForPrResult {
  patchId: string;
  diff: string;
}

type PromptSource = { type: "env"; path: string } | { type: "repo"; path: string } | { type: "builtin" };

type PromptResolutionResult =
  | { ok: true; text: string; source: PromptSource }
  | { ok: false; error: string; source: PromptSource };

type PrDescriptionGenerationResolution =
  | { ok: true; modelRef: string; promptText: string; promptSource: PromptSource }
  | { ok: false; error: string; exitCode?: number };

interface PrDescriptionFingerprintMetadata {
  version: "2";
  patchId: string;
  promptHash: string;
  generator: string;
}

type ManagedGeneratedRegionParseResult =
  | {
      type: "found";
      metadata: PrDescriptionFingerprintMetadata;
      body: string;
      start: number;
      end: number;
    }
  | { type: "missing" }
  | { type: "malformed"; reason: string };

type PrDescriptionValidationIssue =
  | { type: "empty_title" }
  | { type: "title_too_long"; length: number; maxLength: number }
  | { type: "empty_body" }
  | { type: "attribution_footer"; text: string };

type PrDescriptionValidationResult =
  | { ok: true; description: { title: string; body: string } }
  | { ok: false; issues: PrDescriptionValidationIssue[] };

type PreparedPrDescription =
  | { ok: true; title: string; body: string; promptSource: PromptSource }
  | { ok: false; error: string; exitCode?: number };

interface GeneratedPrMetadata {
  title: string;
  fullBody: string;
  promptSource: PromptSource;
}

interface ManagedRegionMarkers {
  beginPrefix: string;
  end: string;
}

type ManagedRegionParseResult<TMetadata> =
  | {
      type: "found";
      metadata: TMetadata;
      body: string;
      start: number;
      end: number;
      beginComment: string;
      rawBody: string;
    }
  | { type: "missing" }
  | { type: "malformed"; reason: string };

export default defineExtension({
  commands: [
    {
      name: "regenerate-pr",
      summary: "Regenerate the PR title and SDL-managed body region.",
      description: REGENERATE_PR_DESCRIPTION,
      schema: regeneratePrSchema,
      async run(ctx: SdlExtensionApi, request: RegeneratePrRequest) {
        const pr = await viewCurrentBranchPr(ctx);
        if (!pr.ok) {
          return failed(`Could not resolve current branch PR.\n${pr.error.message}`, 1);
        }

        const generated = await generateRegeneratedPrMetadata(ctx, pr.value);
        if (!generated.ok) {
          return failed(generated.error, generated.exitCode ?? 1);
        }

        if (ctx.confirm === undefined) {
          return failed(
            "Confirmation is unavailable; PR metadata was generated but GitHub was not edited.",
            1,
          );
        }

        const confirmed = await ctx.confirm(
          "Regenerate PR metadata?",
          formatConfirmationMessage({ pr: pr.value, generated: generated.value, force: request.force }),
        );
        if (!confirmed) {
          return failed("PR metadata regeneration was cancelled; GitHub was not edited.", 1);
        }

        const edited = await editPr(ctx, {
          cwd: ctx.cwd,
          number: pr.value.number,
          title: generated.value.title,
          body: generated.value.fullBody,
        });
        if (!edited.ok) {
          return failed(
            `Generated a PR description, but failed to update PR #${pr.value.number}.\n${edited.error.message}`,
            1,
          );
        }

        return ok(
          [
            "Regenerated PR title and description.",
            `PR: #${pr.value.number} ${pr.value.url}`,
            `Title: ${generated.value.title}`,
            `Prompt: ${formatPromptSourceLabel(generated.value.promptSource)}`,
          ].join("\n"),
        );
      },
    },
  ],
});

async function generateRegeneratedPrMetadata(
  ctx: SdlExtensionApi,
  pr: GithubPrDetails,
): Promise<{ ok: true; value: GeneratedPrMetadata } | { ok: false; error: string; exitCode?: number }> {
  const generation = await resolvePrDescriptionGeneration(ctx);
  if (!generation.ok) return generation;

  const patchId = await stablePatchIdForPr(ctx, {
    cwd: ctx.cwd,
    number: pr.number,
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
  });
  if (!patchId.ok) return { ok: false, error: patchId.error.message };

  const commits = await getPrCommitMessages(ctx, { cwd: ctx.cwd, number: pr.number });
  if (!commits.ok) return { ok: false, error: commits.error.message };

  const prepared = await preparePrDescription({
    textGenerator: ctx.textGenerator,
    modelRef: generation.modelRef,
    promptText: generation.promptText,
    context: {
      kind: "github",
      number: pr.number,
      url: pr.url,
      title: pr.title,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      commitMessages: commits.value,
      diff: patchId.value.diff,
    },
  });
  if (!prepared.ok) return prepared;

  const metadata: PrDescriptionFingerprintMetadata = {
    version: "2",
    patchId: patchId.value.patchId,
    promptHash: hashPrDescriptionPrompt(generation.promptText),
    generator: PR_DESCRIPTION_GENERATOR_VERSION,
  };

  return {
    ok: true,
    value: {
      title: prepared.title,
      fullBody: replaceOrInsertGeneratedRegion(pr.body, prepared.body, metadata),
      promptSource: generation.promptSource,
    },
  };
}

async function viewCurrentBranchPr(ctx: SdlExtensionApi): Promise<Result<GithubPrDetails, CommandFailure>> {
  return viewPrWithArgs(ctx, { cwd: ctx.cwd, args: ["pr", "view", "--json", PR_VIEW_FIELDS] });
}

async function getPrCommitMessages(
  ctx: SdlExtensionApi,
  params: { cwd: string; number: number },
): Promise<Result<PrCommitMessage[], CommandFailure>> {
  const args = ["pr", "view", String(params.number), "--json", "commits"];
  const result = await runGh(ctx, args, VIEW_TIMEOUT_MS);
  const failure = commandFailure({
    command: "gh",
    args,
    result,
    code: "github_pr_commits_failed",
    message: `Could not read commit messages for PR #${params.number}.`,
  });
  if (failure !== undefined) return { ok: false, error: failure };

  const parsed = parseJson(result.stdout);
  if (!isRecord(parsed) || !Array.isArray(parsed.commits)) {
    return {
      ok: false,
      error: {
        code: "github_pr_commits_parse_failed",
        message: `GitHub commits output for PR #${params.number} had an unexpected shape.`,
      },
    };
  }

  const messages: PrCommitMessage[] = [];
  for (const commit of parsed.commits) {
    if (!isRecord(commit) || typeof commit.messageHeadline !== "string") continue;
    const message: PrCommitMessage = { headline: commit.messageHeadline };
    if (typeof commit.messageBody === "string" && commit.messageBody.trim() !== "") {
      message.body = commit.messageBody;
    }
    messages.push(message);
  }
  return { ok: true, value: messages };
}

async function getPrDiff(
  ctx: SdlExtensionApi,
  params: { cwd: string; number: number; baseRefName?: string; headRefName?: string },
): Promise<Result<string, CommandFailure>> {
  const args = ["pr", "diff", String(params.number)];
  const result = await runGh(ctx, args, DIFF_TIMEOUT_MS);
  const failure = commandFailure({
    command: "gh",
    args,
    result,
    code: "github_pr_diff_failed",
    message: `Could not read diff for PR #${params.number}.`,
  });
  if (failure === undefined) return { ok: true, value: result.stdout };

  if (
    params.baseRefName !== undefined &&
    params.headRefName !== undefined &&
    isGithubDiffTooLarge(result)
  ) {
    return await getLocalPrDiff(ctx, {
      cwd: params.cwd,
      number: params.number,
      baseRefName: params.baseRefName,
      headRefName: params.headRefName,
    });
  }
  return { ok: false, error: failure };
}

async function stablePatchIdForPr(
  ctx: SdlExtensionApi,
  params: { cwd: string; number: number; baseRefName?: string; headRefName?: string },
): Promise<Result<StablePatchIdForPrResult, CommandFailure>> {
  const diff = await getPrDiff(ctx, params);
  if (!diff.ok) return diff;

  const args = ["patch-id", "--stable"];
  const result = await ctx.exec("git", args, {
    timeoutMs: PATCH_ID_TIMEOUT_MS,
    stdin: diff.value,
  });
  const failure = commandFailure({
    command: "git",
    args,
    result,
    code: "git_patch_id_failed",
    message: `Could not compute stable patch id for PR #${params.number}.`,
  });
  if (failure !== undefined) return { ok: false, error: failure };

  const patchId = result.stdout.trim().split(/\s+/, 1)[0] ?? "";
  if (patchId === "") {
    return {
      ok: false,
      error: {
        code: "git_patch_id_parse_failed",
        message: `Stable patch-id output for PR #${params.number} was empty or malformed.`,
      },
    };
  }
  return { ok: true, value: { patchId, diff: diff.value } };
}

async function editPr(
  ctx: SdlExtensionApi,
  params: { cwd: string; number: number; title: string; body: string },
): Promise<Result<void, CommandFailure>> {
  return await withTemporaryFile(
    { prefix: "sdl-dev-pr-body-", filename: "body.md", contents: `${params.body}\n` },
    async (bodyPath) => {
      const args = [
        "pr",
        "edit",
        String(params.number),
        "--title",
        params.title,
        "--body-file",
        bodyPath,
      ];
      const result = await runGh(ctx, args, EDIT_TIMEOUT_MS);
      const failure = commandFailure({
        command: "gh",
        args,
        result,
        code: "github_pr_edit_failed",
        message: `Could not update PR #${params.number}.`,
      });
      if (failure !== undefined) return { ok: false, error: failure };
      return { ok: true, value: undefined };
    },
  );
}

async function viewPrWithArgs(
  ctx: SdlExtensionApi,
  params: { cwd: string; args: string[] },
): Promise<Result<GithubPrDetails, CommandFailure>> {
  const result = await runGh(ctx, params.args, VIEW_TIMEOUT_MS);
  const failure = commandFailure({
    command: "gh",
    args: params.args,
    result,
    code: "github_pr_view_failed",
    message: "Could not read GitHub PR details.",
  });
  if (failure !== undefined) return { ok: false, error: failure };

  const parsed = parseGithubPrDetails(result.stdout);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

async function getLocalPrDiff(
  ctx: SdlExtensionApi,
  params: { cwd: string; number: number; baseRefName: string; headRefName: string },
): Promise<Result<string, CommandFailure>> {
  const args = ["diff", `${params.baseRefName}...${params.headRefName}`];
  const result = await ctx.exec("git", args, { timeoutMs: DIFF_TIMEOUT_MS });
  const failure = commandFailure({
    command: "git",
    args,
    result,
    code: "github_pr_local_diff_failed",
    message: `GitHub PR #${params.number} diff was too large for GitHub; could not read local diff for ${params.baseRefName}...${params.headRefName}.`,
  });
  if (failure !== undefined) return { ok: false, error: failure };
  return { ok: true, value: result.stdout };
}

async function runGh(
  ctx: SdlExtensionApi,
  args: readonly string[],
  timeoutMs: number,
): Promise<ExecResult> {
  return await ctx.exec("gh", [...args], { timeoutMs });
}

async function resolvePrDescriptionGeneration(
  ctx: SdlExtensionApi,
): Promise<PrDescriptionGenerationResolution> {
  const repoRoot = await readRepoRoot(ctx);
  const prompt = await resolvePrDescriptionPrompt({
    env: ctx.env,
    cwd: ctx.cwd,
    ...(repoRoot.ok ? { repoRoot: repoRoot.value } : {}),
  });
  if (!prompt.ok) return { ok: false, error: prompt.error, exitCode: 2 };

  return {
    ok: true,
    modelRef: selectPrDescriptionModelRef(ctx.env),
    promptText: prompt.text,
    promptSource: prompt.source,
  };
}

function selectPrDescriptionModelRef(env: Record<string, string | undefined>): string {
  const modelRef = env[PR_DESCRIPTION_MODEL_ENV]?.trim();
  if (modelRef !== undefined && modelRef !== "") {
    return modelRef;
  }
  return DEFAULT_PR_DESCRIPTION_MODEL_REF;
}

async function readRepoRoot(ctx: SdlExtensionApi): Promise<Result<string, CommandFailure>> {
  const args = ["rev-parse", "--show-toplevel"];
  const result = await ctx.exec("git", args, { timeoutMs: VIEW_TIMEOUT_MS });
  const failure = commandFailure({
    command: "git",
    args,
    result,
    code: "git_repo_root_failed",
    message: "Could not determine repository root.",
  });
  if (failure !== undefined) return { ok: false, error: failure };
  return { ok: true, value: result.stdout.trim() };
}

async function resolvePrDescriptionPrompt(input: {
  env: Record<string, string | undefined>;
  repoRoot?: string;
  cwd?: string;
}): Promise<PromptResolutionResult> {
  const envPath = input.env[PR_DESCRIPTION_PROMPT_ENV]?.trim();
  if (envPath) {
    const path = resolvePromptPath(envPath, input.repoRoot, input.cwd);
    try {
      return { ok: true, text: await readFile(path, "utf8"), source: { type: "env", path } };
    } catch (error) {
      return {
        ok: false,
        error: `Could not read ${PR_DESCRIPTION_PROMPT_ENV} prompt file at ${path}: ${formatErrorMessage(error)}`,
        source: { type: "env", path },
      };
    }
  }

  if (input.repoRoot !== undefined) {
    const repoPath = join(input.repoRoot, REPO_PR_DESCRIPTION_PROMPT_PATH);
    if (await isReadableFile(repoPath)) {
      return {
        ok: true,
        text: await readFile(repoPath, "utf8"),
        source: { type: "repo", path: repoPath },
      };
    }
  }

  return { ok: true, text: DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT, source: { type: "builtin" } };
}

function filterLockfileSections(diff: string): string {
  const sections = diff.split(/(?=^diff --git )/m);
  return sections.filter((section) => !isLockfileDiffSection(section)).join("");
}

function truncateDiff(diff: string, maxChars = MAX_DIFF_CHARS): string {
  return truncateTextHeadTail({
    value: diff,
    maxChars,
    headRatio: 0.7,
    buildMarker: (omittedChars) => `\n[... TRUNCATED ${omittedChars} chars ...]\n`,
  });
}

function truncateTextHeadTail(input: {
  value: string;
  maxChars: number;
  headRatio: number;
  buildMarker: (omittedChars: number) => string;
}): string {
  if (input.value.length <= input.maxChars) return input.value;

  const marker = input.buildMarker(input.value.length - input.maxChars);
  const remainingChars = Math.max(0, input.maxChars - marker.length);
  const headChars = Math.floor(remainingChars * input.headRatio);
  const tailChars = remainingChars - headChars;
  const head = input.value.slice(0, headChars);
  const tail = tailChars === 0 ? "" : input.value.slice(input.value.length - tailChars);
  return `${head}${marker}${tail}`;
}

function isLockfileDiffSection(section: string): boolean {
  if (!section.startsWith("diff --git ")) return false;
  const firstLine = section.split("\n", 1)[0] ?? "";
  const match = firstLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (match?.[1] !== undefined && LOCKFILE_BASENAMES.has(basename(match[1]))) return true;
  if (match?.[2] !== undefined && LOCKFILE_BASENAMES.has(basename(match[2]))) return true;
  return false;
}

function formatCommitMessages(messages: readonly PrCommitMessage[]): string {
  return messages
    .map((message) => message.headline.trim())
    .filter((message) => message !== "")
    .join("\n\n---\n\n");
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

function trimOuterBlankLines(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length > 0 && (lines[0]?.trim() ?? "") === "") {
    lines.shift();
  }
  while (lines.length > 0 && (lines[lines.length - 1]?.trim() ?? "") === "") {
    lines.pop();
  }
  return lines.join("\n");
}

function stripOuterCodeFence(text: string): string {
  const trimmed = trimOuterBlankLines(text);
  const lines = trimmed.split("\n");
  const first = lines[0]?.trim() ?? "";
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (lines.length >= 2 && /^```[\w-]*$/.test(first) && last === "```") {
    return trimOuterBlankLines(lines.slice(1, -1).join("\n"));
  }
  return trimmed;
}

function resolvePromptPath(path: string, repoRoot: string | undefined, cwd: string | undefined): string {
  if (isAbsolute(path)) return path;
  return resolve(repoRoot ?? cwd ?? process.cwd(), path);
}

async function isReadableFile(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function withTemporaryFile<T>(
  options: { prefix: string; filename: string; contents: string },
  callback: (path: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), options.prefix));
  try {
    const path = join(directory, options.filename);
    await writeFile(path, options.contents, "utf8");
    return await callback(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let start = 0;
  while (true) {
    const index = content.indexOf(needle, start);
    if (index === -1) return count;
    count += 1;
    start = index + needle.length;
  }
}

function formatPromptSourceLabel(source: PromptSource): string {
  return source.type === "builtin" ? "built-in" : source.path;
}

function formatConfirmationMessage(input: {
  pr: GithubPrDetails;
  generated: GeneratedPrMetadata;
  force: boolean;
}): string {
  const lines = [
    `PR #${input.pr.number}: ${input.pr.url}`,
    `Current title: ${input.pr.title}`,
    `New title: ${input.generated.title}`,
    "",
    "This will update the PR title and SDL-managed generated description region.",
  ];
  if (input.force) {
    lines.push("", "--force was provided, but it is a compatibility no-op and does not bypass confirmation.");
  }
  return lines.join("\n");
}

function hashPrDescriptionPrompt(promptText: string): string {
  return `sha256:${createHash("sha256").update(promptText, "utf8").digest("hex")}`;
}

function formatManagedGeneratedRegion(
  body: string,
  metadata: PrDescriptionFingerprintMetadata,
): string {
  const begin = `${MANAGED_BODY_BEGIN_MARKER} version=${metadata.version} patch-id=${metadata.patchId} prompt=${metadata.promptHash} generator=${metadata.generator} -->`;
  return [
    begin,
    "<details open>",
    "<summary>Generated PR description</summary>",
    "",
    body.trim(),
    "",
    "</details>",
    MANAGED_BODY_END_MARKER,
  ].join("\n");
}

function replaceOrInsertGeneratedRegion(
  existingBody: string,
  generatedBody: string,
  metadata: PrDescriptionFingerprintMetadata,
): string {
  const region = formatManagedGeneratedRegion(generatedBody, metadata);
  const parsed = parseManagedGeneratedRegion(existingBody);
  if (parsed.type === "found") {
    return `${existingBody.slice(0, parsed.start)}${region}${existingBody.slice(parsed.end)}`;
  }
  if (existingBody.includes(GENERATED_BODY_MARKER)) {
    return region;
  }
  const trimmedExisting = existingBody.trim();
  return trimmedExisting === "" ? region : `${region}\n\n${trimmedExisting}`;
}

function parseManagedGeneratedRegion(body: string): ManagedGeneratedRegionParseResult {
  const start = body.indexOf(MANAGED_BODY_BEGIN_MARKER);
  if (start === -1) return { type: "missing" };
  const beginEnd = body.indexOf("-->", start);
  if (beginEnd === -1) return { type: "malformed", reason: "missing begin marker close" };
  const endStart = body.indexOf(MANAGED_BODY_END_MARKER, beginEnd);
  if (endStart === -1) return { type: "malformed", reason: "missing end marker" };
  const end = endStart + MANAGED_BODY_END_MARKER.length;
  const metadata = parseManagedRegionMetadata(body.slice(start, beginEnd + 3));
  if (metadata === undefined) return { type: "malformed", reason: "invalid metadata" };
  return {
    type: "found",
    metadata,
    body: extractManagedRegionBody(body.slice(beginEnd + 3, endStart)),
    start,
    end,
  };
}

function parseManagedRegionMetadata(comment: string): PrDescriptionFingerprintMetadata | undefined {
  const fields = new Map<string, string>();
  for (const match of comment.matchAll(/([a-z-]+)=([^\s>]+)/g)) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) fields.set(key, value);
  }
  const version = fields.get("version");
  const patchId = fields.get("patch-id");
  const promptHash = fields.get("prompt");
  const generator = fields.get("generator");
  if (version !== "2" || patchId === undefined || promptHash === undefined || generator === undefined) {
    return undefined;
  }
  return { version, patchId, promptHash, generator };
}

function extractManagedRegionBody(regionContents: string): string {
  const normalized = regionContents.replace(/\r/g, "");
  const match = normalized.match(/<details open>\n<summary>Generated PR description<\/summary>\n\n([\s\S]*?)\n\n<\/details>/);
  return match?.[1]?.trim() ?? normalized.trim();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parseGithubPrDetails(output: string): Result<GithubPrDetails, CommandFailure> {
  const parsed = parseJson(output);
  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: { code: "github_pr_parse_failed", message: "GitHub PR output had an unexpected shape." },
    };
  }
  const number = parsed.number;
  const url = parsed.url;
  const title = parsed.title;
  const body = parsed.body;
  const headRefName = parsed.headRefName;
  const baseRefName = parsed.baseRefName;
  if (
    typeof number !== "number" ||
    typeof url !== "string" ||
    typeof title !== "string" ||
    typeof body !== "string" ||
    typeof headRefName !== "string" ||
    typeof baseRefName !== "string"
  ) {
    return {
      ok: false,
      error: { code: "github_pr_parse_failed", message: "GitHub PR output had an unexpected shape." },
    };
  }
  return { ok: true, value: { number, url, title, body, headRefName, baseRefName } };
}

function commandFailure(input: {
  command: string;
  args: readonly string[];
  result: ExecResult;
  code: string;
  message: string;
}): CommandFailure | undefined {
  if (input.result.code === 0) return undefined;
  const details = input.result.stderr.trim() || input.result.stdout.trim();
  const killed = input.result.killed ? " (killed or timed out)" : "";
  const suffix = details
    ? `\n${formatCommand(input.command, input.args)} exited ${input.result.code}${killed}: ${details}`
    : `\n${formatCommand(input.command, input.args)} exited ${input.result.code}${killed}`;
  return { code: input.code, message: `${input.message}${suffix}` };
}

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map(formatCommandArg).join(" ");
}

function formatCommandArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
  return JSON.stringify(arg);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
