import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

import type { GitGateway } from "@nseng-ai/foundation/git";
import {
	type TextGenerationResult,
	type TextGenerationUsage,
	type TextGenerator,
} from "@nseng-ai/extension-kit/text-generation";
import { buildFencedTextBlock, formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { normalizeTextOutput, trimOuterBlankLines } from "@nseng-ai/foundation/text-normalization";
import { truncateTextHeadTail } from "@nseng-ai/foundation/text-truncation";
import { prepareRepairedText } from "@nseng-ai/extension-kit/text-repair";
import type { TimeServices } from "@nseng-ai/foundation/time";

export type { TimeServices } from "@nseng-ai/foundation/time";
import { formatElapsedMs } from "@nseng-ai/foundation/time-format";
import {
	loadPointCatalog,
	nodeProjectConfigGateway,
	resolvePromptPointPath,
	resolvePromptPointSource,
	type PreloadedPointDescriptor,
	type PromptPointSource,
} from "@nseng-ai/sdk/project-config/points";
import type { PrCommitMessage } from "./github-pr-gateway.ts";

export const PR_INVENTORY_PROMPT_ENV = "NS_FLOW_PR_INVENTORY_PROMPT";
export const FLOW_PR_INVENTORY_POINT_ID = "flow.submit.pr-inventory";
export const REPO_PR_INVENTORY_PROMPT_PATH = `.ns/prompts/${FLOW_PR_INVENTORY_POINT_ID}.md`;
export const MAX_DIFF_CHARS = 120_000;

const prInventoryPromptEnvOverride = {
	pointId: FLOW_PR_INVENTORY_POINT_ID,
	envVar: PR_INVENTORY_PROMPT_ENV,
} as const;

const LOCKFILE_BASENAMES = new Set([
	"pnpm-lock.yaml",
	"package-lock.json",
	"yarn.lock",
	"uv.lock",
	"poetry.lock",
	"Cargo.lock",
]);

export interface FlowPrInventoryDescriptorSource {
	descriptor: PreloadedPointDescriptor["descriptor"];
	descriptorUrl: string;
}

export type PromptSource =
	| { type: "env"; path: string }
	| { type: "repo"; path: string }
	| { type: "builtin" };

export type PromptResolutionResult =
	| { ok: true; text: string; source: PromptSource }
	| { ok: false; error: string; source: PromptSource };

export type PrInventoryGenerationResolution =
	| { ok: true; modelSelection: ModelSelection; promptText: string; promptSource: PromptSource }
	| { ok: false; error: string; exitCode?: number };

export type PrInventoryPromptContext =
	| ExistingPrInventoryPromptContext
	| LocalPrInventoryPromptContext;

export interface ExistingPrInventoryPromptContext {
	kind: "github";
	number: number;
	url: string;
	headRefName: string;
	baseRefName: string;
	commitMessages?: readonly PrCommitMessage[];
	diff: string;
}

export interface LocalPrInventoryPromptContext {
	kind: "local";
	title: string;
	headRefName: string;
	baseRefName: string;
	commitMessages?: readonly PrCommitMessage[];
	diff: string;
}

export interface ParsedPrInventory {
	title: string;
	body: string;
}

export type PrInventoryValidationIssue =
	| { type: "empty_title" }
	| { type: "title_too_long"; length: number; maxLength: number }
	| { type: "empty_body" }
	| { type: "attribution_footer"; text: string }
	| { type: "reserved_transparency_region"; text: string };

export type PrInventoryValidationResult =
	| { ok: true; inventory: ParsedPrInventory }
	| { ok: false; issues: PrInventoryValidationIssue[] };

export type PreparedPrInventory =
	| { ok: true; title: string; body: string; source: "model" | "repaired_model"; feedback?: string }
	| { ok: false; error: string };

export async function resolvePrInventoryGeneration(input: {
	env: Record<string, string | undefined>;
	cwd: string;
	git: GitGateway;
	descriptorSource: FlowPrInventoryDescriptorSource;
	modelSelection: ModelSelection;
}): Promise<PrInventoryGenerationResolution> {
	const repoRoot = await input.git.repoRoot({ cwd: input.cwd });
	const prompt = await resolvePrInventoryPrompt({
		env: input.env,
		cwd: input.cwd,
		descriptorSource: input.descriptorSource,
		...(repoRoot.ok ? { repoRoot: repoRoot.value } : {}),
	});
	if (!prompt.ok) {
		return { ok: false, error: prompt.error, exitCode: 2 };
	}

	return {
		ok: true,
		modelSelection: input.modelSelection,
		promptText: prompt.text,
		promptSource: prompt.source,
	};
}

interface PrInventoryPointContext {
	env: Record<string, string | undefined>;
	descriptorSource: FlowPrInventoryDescriptorSource;
	repoRoot?: string;
	cwd?: string;
}

export async function resolvePrInventoryPrompt(
	input: PrInventoryPointContext,
): Promise<PromptResolutionResult> {
	const catalogRoot = input.repoRoot ?? input.cwd ?? process.cwd();
	const catalog = loadPointCatalog({
		repoRoot: catalogRoot,
		gateway: nodeProjectConfigGateway,
		preferredDescriptors: [
			{
				descriptor: input.descriptorSource.descriptor,
				descriptorPath: fileURLToPath(input.descriptorSource.descriptorUrl),
			},
		],
		promptEnvOverride: prInventoryPromptEnvOverride,
		env: input.env,
	});
	const pointSource = resolvePromptPointSource(catalog, FLOW_PR_INVENTORY_POINT_ID);
	return await readPrInventoryPointSource({ catalogRoot, pointSource });
}

async function readPrInventoryPointSource(request: {
	catalogRoot: string;
	pointSource: PromptPointSource;
}): Promise<PromptResolutionResult> {
	if (request.pointSource.type === "env") {
		const path = resolve(request.catalogRoot, request.pointSource.path);
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
	if (request.pointSource.type === "missing") {
		return {
			ok: false,
			error: `Could not resolve ${FLOW_PR_INVENTORY_POINT_ID}: the point catalog has no installed prompt or descriptor default.`,
			source: { type: "builtin" },
		};
	}

	const resolved = resolvePromptPointPath(request.catalogRoot, request.pointSource);
	const source: PromptSource =
		request.pointSource.type === "default"
			? { type: "builtin" }
			: {
					type: "repo",
					path: resolved?.path ?? resolve(request.catalogRoot, request.pointSource.path),
				};
	if (resolved === undefined) {
		return {
			ok: false,
			error: `Could not resolve selected ${request.pointSource.type} prompt path ${request.pointSource.path} for ${FLOW_PR_INVENTORY_POINT_ID} from catalog root ${request.catalogRoot}.`,
			source,
		};
	}

	let text: string;
	try {
		text = await readFile(resolved.path, "utf8");
	} catch (error) {
		return {
			ok: false,
			error: isNodeFileNotFound(error)
				? `Selected ${resolved.label} is missing at ${resolved.path}.`
				: `Could not read selected ${resolved.label} at ${resolved.path}: ${formatErrorMessage(error)}`,
			source,
		};
	}
	if (text.trim() === "") {
		return {
			ok: false,
			error: `Selected ${resolved.label} at ${resolved.path} is empty.`,
			source,
		};
	}

	return {
		ok: true,
		text: request.pointSource.type === "default" ? text.trimEnd() : text,
		source,
	};
}

export function buildPrInventoryUserPrompt(input: PrInventoryPromptContext): string {
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
		`## Diff\n\n${buildFencedTextBlock(diff.trimEnd(), "diff")}`,
		"Generate a fresh PR title and body from this evidence:",
	);
	return `${sections.join("\n\n")}\n`;
}

export function parsePrInventoryOutput(text: string): PrInventoryValidationResult {
	const normalized = normalizeTextOutput(text);
	const lines = normalized.split("\n");
	const titleIndex = lines.findIndex((line) => line.trim() !== "");
	const title = titleIndex === -1 ? "" : (lines[titleIndex]?.trim() ?? "");
	const body = titleIndex === -1 ? "" : trimOuterBlankLines(lines.slice(titleIndex + 1).join("\n"));
	return validatePrInventory({ title, body });
}

export function validatePrInventory(inventory: ParsedPrInventory): PrInventoryValidationResult {
	const issues: PrInventoryValidationIssue[] = [];
	if (inventory.title.trim() === "") {
		issues.push({ type: "empty_title" });
	}
	if (inventory.title.length > 120) {
		issues.push({ type: "title_too_long", length: inventory.title.length, maxLength: 120 });
	}
	if (inventory.body.trim() === "") {
		issues.push({ type: "empty_body" });
	}
	for (const line of inventory.body.split("\n")) {
		if (/Generated with|Co-Authored-By/i.test(line)) {
			issues.push({ type: "attribution_footer", text: line.trim() });
		}
		if (
			/^\s*>\s*(?:\[!IMPORTANT\]|\*\*Assembled PR inventory\.\*\*)/i.test(line) ||
			/^\*?Automatically generated (?:PR inventory|by `ns flow (?:submit|generate-pr-inventory)`) from the diff and commit headlines, without author steering, interview, or approval\. It may omit intent, rationale, constraints, or context not visible in that evidence\.\*?$/i.test(
				line.trim(),
			) ||
			/^_?Evidence inputs:.*Command:.*Prompt:.*Model:.*_?$/i.test(line.trim())
		) {
			issues.push({ type: "reserved_transparency_region", text: line.trim() });
		}
	}
	if (issues.length > 0) {
		return { ok: false, issues };
	}
	return {
		ok: true,
		inventory: { title: inventory.title.trim(), body: inventory.body.trim() },
	};
}

export function formatPrInventoryValidationFeedback(
	issues: readonly PrInventoryValidationIssue[],
): string {
	return issues.map(formatPrInventoryValidationIssue).join("\n");
}

export async function preparePrInventory(input: {
	textGenerator: TextGenerator;
	modelSelection: ModelSelection;
	promptText: string;
	context: PrInventoryPromptContext;
	onProgress?: (message: string) => void;
	time?: TimeServices;
}): Promise<PreparedPrInventory> {
	const firstPrompt = buildPrInventoryUserPrompt(input.context);
	const prepared = await prepareRepairedText({
		noun: "PR inventory",
		initialPrompt: firstPrompt,
		generate: async (prompt) => {
			const generated = await generatePrInventoryText(
				input.textGenerator,
				input.modelSelection,
				input.promptText,
				prompt,
			);
			if (generated.ok) {
				input.onProgress?.(
					`PR inventory generated (${formatTextGenerationUsage(generated.usage)})`,
				);
			}
			return generated;
		},
		validate: (text) => {
			const validation = parsePrInventoryOutput(text);
			if (validation.ok) return { ok: true, value: validation.inventory };
			return { ok: false, feedback: formatPrInventoryValidationFeedback(validation.issues) };
		},
		buildRepairPrompt: ({ initialPrompt, previousDraft, feedback }) =>
			`${initialPrompt}\n## previous invalid draft\n\n${previousDraft.trim()}\n\n## validation feedback\n\n${feedback}\n\nRewrite the PR title and body so it satisfies every validation rule. Return only the corrected PR title and body.\n`,
		onProgress: (event) => {
			switch (event.type) {
				case "attempt_started":
					input.onProgress?.(
						`generating PR inventory (attempt ${event.attempt}/${event.maxAttempts})`,
					);
					break;
				case "attempt_waiting":
					input.onProgress?.(
						`still generating PR inventory (${formatElapsedMs(event.elapsedMs)} elapsed)`,
					);
					break;
				case "attempt_invalid":
					input.onProgress?.("PR inventory draft failed validation; requesting repair");
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

function formatPrContextLines(input: PrInventoryPromptContext): string[] {
	switch (input.kind) {
		case "github":
			return [`- PR: #${input.number} (${input.url})`];
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

function isNodeFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

async function generatePrInventoryText(
	textGenerator: TextGenerator,
	modelSelection: ModelSelection,
	system: string,
	prompt: string,
): Promise<TextGenerationResult> {
	return textGenerator.generateText({
		modelSelection,
		system,
		prompt,
		maxTokens: 2048,
		operation: "flow.pr-inventory",
	});
}

function formatPrInventoryValidationIssue(issue: PrInventoryValidationIssue): string {
	switch (issue.type) {
		case "empty_title":
			return "- Title is empty.";
		case "title_too_long":
			return `- Title is ${issue.length} characters; maximum is ${issue.maxLength}.`;
		case "empty_body":
			return "- Body is empty.";
		case "attribution_footer":
			return `- Body contains an attribution footer: ${issue.text}`;
		case "reserved_transparency_region":
			return `- Body attempts to supply Flow-owned disclosure or provenance: ${issue.text}`;
	}
}
