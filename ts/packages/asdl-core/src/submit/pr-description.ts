import { access, readFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

import type { GitGateway } from "../git/index.ts";
import { formatErrorMessage } from "../primitives.ts";
import { truncateTextHeadTail } from "../text-truncation.ts";
import { prepareRepairedText } from "../text-repair.ts";

import type { PrCommitMessage } from "./github-pr-gateway.ts";
import { selectPrDescriptionModelRef, type TextGenerationGateway } from "./text-generation.ts";

export const PR_DESCRIPTION_PROMPT_ENV = "ASDL_DEV_PR_DESCRIPTION_PROMPT";
export const REPO_PR_DESCRIPTION_PROMPT_PATH = ".asdl/prompts/pr-description.md";
export const GENERATED_BODY_MARKER = "<!-- generated-by: asdl-dev pr-description v1 -->";
export const MAX_DIFF_CHARS = 1_000_000;

const LOCKFILE_BASENAMES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "uv.lock", "poetry.lock", "Cargo.lock"]);

export const DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT = `You are a pull request description generator. Analyze the provided git diff and return ONLY a PR title and body.

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
- First line = PR title, rest = PR body
- Avoid function-level details unless critical
- Maximum 5 key changes
- Only include Critical Notes if necessary`;

export type PromptSource = { type: "env"; path: string } | { type: "repo"; path: string } | { type: "builtin" };

export type PromptResolutionResult =
	| { ok: true; text: string; source: PromptSource }
	| { ok: false; error: string; source: PromptSource };

export type PrDescriptionGenerationResolution =
	| { ok: true; modelRef: string; promptText: string; promptSource: PromptSource }
	| { ok: false; error: string; exitCode?: number };

export type PrDescriptionPromptContext = ExistingPrDescriptionPromptContext | LocalPrDescriptionPromptContext;

export interface ExistingPrDescriptionPromptContext {
	kind: "github";
	number: number;
	url: string;
	title: string;
	headRefName: string;
	baseRefName: string;
	commitMessages?: readonly PrCommitMessage[];
	diff: string;
}

export interface LocalPrDescriptionPromptContext {
	kind: "local";
	title: string;
	headRefName: string;
	baseRefName: string;
	commitMessages?: readonly PrCommitMessage[];
	diff: string;
}

export interface ParsedPrDescription {
	title: string;
	body: string;
}

export type PrDescriptionValidationIssue =
	| { type: "empty_title" }
	| { type: "title_too_long"; length: number; maxLength: number }
	| { type: "empty_body" }
	| { type: "attribution_footer"; text: string };

export type PrDescriptionValidationResult =
	| { ok: true; description: ParsedPrDescription }
	| { ok: false; issues: PrDescriptionValidationIssue[] };

export type PreparedPrDescription =
	| { ok: true; title: string; body: string; source: "model" | "repaired_model"; feedback?: string }
	| { ok: false; error: string };

export function hasGeneratedMarker(body: string): boolean {
	return body.includes(GENERATED_BODY_MARKER);
}

export function isCommitMessagePrefillBody(body: string, commits: readonly PrCommitMessage[]): boolean {
	const trimmedBody = body.trim();
	// Empty bodies are owned by the existing empty-body overwrite check.
	if (trimmedBody === "") return false;
	return commits.some((commit) => commit.body?.trim() === trimmedBody);
}

export function appendGeneratedMarker(body: string): string {
	const withoutExistingMarker = body.replace(GENERATED_BODY_MARKER, "").trimEnd();
	return `${withoutExistingMarker}\n\n${GENERATED_BODY_MARKER}`;
}

export async function resolvePrDescriptionGeneration(input: {
	env: Record<string, string | undefined>;
	cwd: string;
	git: GitGateway;
}): Promise<PrDescriptionGenerationResolution> {
	const repoRoot = await input.git.repoRoot({ cwd: input.cwd });
	const prompt = await resolvePrDescriptionPrompt({
		env: input.env,
		cwd: input.cwd,
		...(repoRoot.ok ? { repoRoot: repoRoot.value } : {}),
	});
	if (!prompt.ok) {
		return { ok: false, error: prompt.error, exitCode: 2 };
	}

	return { ok: true, modelRef: selectPrDescriptionModelRef(input.env), promptText: prompt.text, promptSource: prompt.source };
}

export async function resolvePrDescriptionPrompt(input: {
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
			return { ok: false, error: `Could not read ${PR_DESCRIPTION_PROMPT_ENV} prompt file at ${path}: ${formatErrorMessage(error)}`, source: { type: "env", path } };
		}
	}

	if (input.repoRoot !== undefined) {
		const repoPath = join(input.repoRoot, REPO_PR_DESCRIPTION_PROMPT_PATH);
		if (await isReadableFile(repoPath)) {
			return { ok: true, text: await readFile(repoPath, "utf8"), source: { type: "repo", path: repoPath } };
		}
	}

	return { ok: true, text: DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT, source: { type: "builtin" } };
}

export function buildPrDescriptionUserPrompt(input: PrDescriptionPromptContext): string {
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
	sections.push(`## Diff\n\n\`\`\`diff\n${diff.trimEnd()}\n\`\`\``, "Generate a PR title and body for this diff:");
	return `${sections.join("\n\n")}\n`;
}

export function parsePrDescriptionOutput(text: string): PrDescriptionValidationResult {
	const normalized = stripOuterCodeFence(trimOuterBlankLines(text.replace(/\r/g, "")));
	const lines = normalized.split("\n");
	const titleIndex = lines.findIndex((line) => line.trim() !== "");
	const title = titleIndex === -1 ? "" : lines[titleIndex]?.trim() ?? "";
	const body = titleIndex === -1 ? "" : trimOuterBlankLines(lines.slice(titleIndex + 1).join("\n"));
	return validatePrDescription({ title, body });
}

export function validatePrDescription(description: ParsedPrDescription): PrDescriptionValidationResult {
	const issues: PrDescriptionValidationIssue[] = [];
	if (description.title.trim() === "") {
		issues.push({ type: "empty_title" });
	}
	if (description.title.length > 120) {
		issues.push({ type: "title_too_long", length: description.title.length, maxLength: 120 });
	}
	if (description.body.trim() === "") {
		issues.push({ type: "empty_body" });
	}
	for (const line of description.body.split("\n")) {
		if (/Generated with|Co-Authored-By/i.test(line)) {
			issues.push({ type: "attribution_footer", text: line.trim() });
		}
	}
	if (issues.length > 0) {
		return { ok: false, issues };
	}
	return { ok: true, description: { title: description.title.trim(), body: description.body.trim() } };
}

export function formatPrDescriptionValidationFeedback(issues: readonly PrDescriptionValidationIssue[]): string {
	return issues.map(formatPrDescriptionValidationIssue).join("\n");
}

export async function preparePrDescription(input: {
	textGeneration: TextGenerationGateway;
	modelRef: string;
	promptText: string;
	context: PrDescriptionPromptContext;
}): Promise<PreparedPrDescription> {
	const firstPrompt = buildPrDescriptionUserPrompt(input.context);
	const prepared = await prepareRepairedText({
		noun: "PR description",
		initialPrompt: firstPrompt,
		generate: (prompt) => generatePrDescriptionText(input.textGeneration, input.modelRef, input.promptText, prompt),
		validate: (text) => {
			const validation = parsePrDescriptionOutput(text);
			if (validation.ok) return { ok: true, value: validation.description };
			return { ok: false, feedback: formatPrDescriptionValidationFeedback(validation.issues) };
		},
		buildRepairPrompt: ({ initialPrompt, previousDraft, feedback }) =>
			`${initialPrompt}\n## previous invalid draft\n\n${previousDraft.trim()}\n\n## validation feedback\n\n${feedback}\n\nRewrite the PR title and body so it satisfies every validation rule. Return only the corrected PR title and body.\n`,
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

export function filterLockfileSections(diff: string): string {
	const sections = diff.split(/(?=^diff --git )/m);
	return sections.filter((section) => !isLockfileDiffSection(section)).join("");
}

export function truncateDiff(diff: string, maxChars = MAX_DIFF_CHARS): string {
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
			return [`- PR: #${input.number} (${input.url})`, `- Current PR title: ${input.title}`];
		case "local":
			return ["- PR: not yet created; generate initial metadata for Graphite submit", `- Title source (commit headline): ${input.title}`];
	}
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
		// Missing repo-local prompt files are expected; fall back to the built-in prompt.
		return false;
	}
}

async function generatePrDescriptionText(
	textGeneration: TextGenerationGateway,
	modelRef: string,
	system: string,
	prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	return textGeneration.generateText({
		modelRef,
		system,
		prompt,
		maxTokens: 2048,
		reasoning: "low",
		operation: "pr-description",
	});
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
