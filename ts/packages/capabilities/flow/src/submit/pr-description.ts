import { readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	DEFAULT_PR_DESCRIPTION_MODEL_REF,
	PR_DESCRIPTION_MODEL_ENV,
	selectPrDescriptionModelRef,
	type TextGenerationResult,
	type TextGenerationUsage,
	type TextGenerator,
} from "@nseng-ai/capability-kit/text-generation";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { normalizeTextOutput, trimOuterBlankLines } from "@nseng-ai/foundation/text-normalization";
import { truncateTextHeadTail } from "@nseng-ai/foundation/text-truncation";
import { prepareRepairedText } from "@nseng-ai/capability-kit/text-repair";
import type { TimeServices } from "@nseng-ai/foundation/time";

export type { TimeServices } from "@nseng-ai/foundation/time";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import {
	buildPointCatalog,
	loadPointCatalog,
	nodeProjectConfigGateway,
	resolvePromptPointPath,
	resolvePromptPointSource,
	type PointCatalog,
	type PromptPointSource,
} from "@nseng-ai/kernel/project-config/points";

import type { PrCommitMessage } from "./github-pr-gateway.ts";

export { DEFAULT_PR_DESCRIPTION_MODEL_REF, PR_DESCRIPTION_MODEL_ENV, selectPrDescriptionModelRef };
export const PR_DESCRIPTION_PROMPT_ENV = "NS_DEV_PR_DESCRIPTION_PROMPT";
export const FLOW_PR_DESCRIPTION_POINT_ID = "flow.submit.pr-description";
export const REPO_PR_DESCRIPTION_PROMPT_PATH = `.ns/prompts/${FLOW_PR_DESCRIPTION_POINT_ID}.md`;
export const MAX_DIFF_CHARS = 120_000;

const prDescriptionPromptEnvOverride = {
	pointId: FLOW_PR_DESCRIPTION_POINT_ID,
	envVar: PR_DESCRIPTION_PROMPT_ENV,
} as const;

const LOCKFILE_BASENAMES = new Set([
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"uv.lock",
	"poetry.lock",
	"Cargo.lock",
]);

const DEFAULT_PR_DESCRIPTION_PROMPT_PATH = "./prompts/pr-description-default.md";
const DEFAULT_PR_DESCRIPTION_PROMPT_URL = new URL(
	DEFAULT_PR_DESCRIPTION_PROMPT_PATH,
	import.meta.url,
);
const DEFAULT_PR_DESCRIPTION_PROMPT_MANIFEST_PATH = fileURLToPath(import.meta.url);

export const DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT = readFileSync(
	DEFAULT_PR_DESCRIPTION_PROMPT_URL,
	"utf8",
).trimEnd();

export type PromptSource =
	| { type: "env"; path: string }
	| { type: "repo"; path: string }
	| { type: "builtin" };

export type PromptResolutionResult =
	| { ok: true; text: string; source: PromptSource }
	| { ok: false; error: string; source: PromptSource };

export type PrDescriptionGenerationResolution =
	| { ok: true; modelRef: string; promptText: string; promptSource: PromptSource }
	| { ok: false; error: string; exitCode?: number };

export type PrDescriptionPromptContext =
	| ExistingPrDescriptionPromptContext
	| LocalPrDescriptionPromptContext;

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

	return {
		ok: true,
		modelRef: selectPrDescriptionModelRef(input.env),
		promptText: prompt.text,
		promptSource: prompt.source,
	};
}

interface PrDescriptionPointContext {
	env: Record<string, string | undefined>;
	repoRoot?: string;
	cwd?: string;
}

export async function resolvePrDescriptionPrompt(
	input: PrDescriptionPointContext,
): Promise<PromptResolutionResult> {
	const catalog = loadPrDescriptionPointCatalog(input);
	const pointSource = resolvePromptPointSource(catalog, FLOW_PR_DESCRIPTION_POINT_ID);
	const prompt = await readPrDescriptionPointSource({ ...input, pointSource });
	if (prompt !== undefined) return prompt;

	return { ok: true, text: DEFAULT_PR_DESCRIPTION_SYSTEM_PROMPT, source: { type: "builtin" } };
}

function loadPrDescriptionPointCatalog(request: PrDescriptionPointContext): PointCatalog {
	if (request.repoRoot !== undefined) {
		const catalog = loadPointCatalog({
			repoRoot: request.repoRoot,
			gateway: nodeProjectConfigGateway,
			promptEnvOverride: prDescriptionPromptEnvOverride,
			env: request.env,
		});
		if (resolvePromptPointSource(catalog, FLOW_PR_DESCRIPTION_POINT_ID).type !== "missing") {
			return catalog;
		}
	}
	return buildPointCatalog({
		repoRoot: request.repoRoot ?? process.cwd(),
		gateway: { pathExists: () => ({ type: "missing" }) },
		pointDefinitions: [
			{
				id: FLOW_PR_DESCRIPTION_POINT_ID,
				accepts: "prompt",
				semantics: "override",
				defaultPath: DEFAULT_PR_DESCRIPTION_PROMPT_PATH,
				manifestPath: DEFAULT_PR_DESCRIPTION_PROMPT_MANIFEST_PATH,
			},
		],
		config: { points: [], settings: new Map() },
	});
}

async function readPrDescriptionPointSource(
	request: PrDescriptionPointContext & { pointSource: PromptPointSource },
): Promise<PromptResolutionResult | undefined> {
	switch (request.pointSource.type) {
		case "env": {
			const path = resolvePromptPath(request.pointSource.path, request.repoRoot, request.cwd);
			try {
				return { ok: true, text: await readFile(path, "utf8"), source: { type: "env", path } };
			} catch (error) {
				return {
					ok: false,
					error: `Could not read ${request.pointSource.envVar} prompt file at ${path}: ${formatErrorMessage(error)}`,
					source: { type: "env", path },
				};
			}
		}
		case "ns.toml":
		case "conventional": {
			if (request.repoRoot === undefined) return undefined;
			const resolved = resolvePromptPointPath(request.repoRoot, request.pointSource);
			if (resolved === undefined || !(await isReadableFile(resolved.path))) return undefined;
			return {
				ok: true,
				text: await readFile(resolved.path, "utf8"),
				source: { type: "repo", path: resolved.path },
			};
		}
		case "default": {
			const resolved = resolvePromptPointPath(
				request.repoRoot ?? process.cwd(),
				request.pointSource,
			);
			if (resolved === undefined) return undefined;
			const text = await readFile(resolved.path, "utf8");
			return { ok: true, text: text.trimEnd(), source: { type: "builtin" } };
		}
		case "missing":
			return undefined;
	}
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
	sections.push(
		`## Diff\n\n\`\`\`diff\n${diff.trimEnd()}\n\`\`\``,
		"Generate a fresh PR title and body for this diff. Do not preserve an existing PR title unless the diff independently supports it:",
	);
	return `${sections.join("\n\n")}\n`;
}

export function parsePrDescriptionOutput(text: string): PrDescriptionValidationResult {
	const normalized = normalizeTextOutput(text);
	const lines = normalized.split("\n");
	const titleIndex = lines.findIndex((line) => line.trim() !== "");
	const title = titleIndex === -1 ? "" : (lines[titleIndex]?.trim() ?? "");
	const body = titleIndex === -1 ? "" : trimOuterBlankLines(lines.slice(titleIndex + 1).join("\n"));
	return validatePrDescription({ title, body });
}

export function validatePrDescription(
	description: ParsedPrDescription,
): PrDescriptionValidationResult {
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
	return {
		ok: true,
		description: { title: description.title.trim(), body: description.body.trim() },
	};
}

export function formatPrDescriptionValidationFeedback(
	issues: readonly PrDescriptionValidationIssue[],
): string {
	return issues.map(formatPrDescriptionValidationIssue).join("\n");
}

export async function preparePrDescription(input: {
	textGenerator: TextGenerator;
	modelRef: string;
	promptText: string;
	context: PrDescriptionPromptContext;
	onProgress?: (message: string) => void;
	time?: TimeServices;
}): Promise<PreparedPrDescription> {
	const firstPrompt = buildPrDescriptionUserPrompt(input.context);
	const prepared = await prepareRepairedText({
		noun: "PR description",
		initialPrompt: firstPrompt,
		generate: async (prompt) => {
			const generated = await generatePrDescriptionText(
				input.textGenerator,
				input.modelRef,
				input.promptText,
				prompt,
			);
			if (generated.ok) {
				input.onProgress?.(`PR metadata generated (${formatTextGenerationUsage(generated.usage)})`);
			}
			return generated;
		},
		validate: (text) => {
			const validation = parsePrDescriptionOutput(text);
			if (validation.ok) return { ok: true, value: validation.description };
			return { ok: false, feedback: formatPrDescriptionValidationFeedback(validation.issues) };
		},
		buildRepairPrompt: ({ initialPrompt, previousDraft, feedback }) =>
			`${initialPrompt}\n## previous invalid draft\n\n${previousDraft.trim()}\n\n## validation feedback\n\n${feedback}\n\nRewrite the PR title and body so it satisfies every validation rule. Return only the corrected PR title and body.\n`,
		onProgress: (event) => {
			switch (event.type) {
				case "attempt_started":
					input.onProgress?.(
						`generating PR metadata (attempt ${event.attempt}/${event.maxAttempts})`,
					);
					break;
				case "attempt_waiting":
					input.onProgress?.(
						`still generating PR metadata (${formatElapsedMs(event.elapsedMs)} elapsed)`,
					);
					break;
				case "attempt_invalid":
					input.onProgress?.("PR metadata draft failed validation; requesting repair");
					break;
			}
		},
		...(input.time ?? {}),
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

function formatTextGenerationUsage(usage: TextGenerationUsage | undefined): string {
	if (usage === undefined) return "token usage unavailable";
	return `tokens in ${usage.inputTokens}, out ${usage.outputTokens}`;
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

function resolvePromptPath(
	path: string,
	repoRoot: string | undefined,
	cwd: string | undefined,
): string {
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
	textGenerator: TextGenerator,
	modelRef: string,
	system: string,
	prompt: string,
): Promise<TextGenerationResult> {
	return textGenerator.generateText({
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
