import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { HarnessReviewRequest, ReviewInputCoverage } from "../models.ts";
import { promptSizedDiff } from "./harness-diff-cap.ts";

export const MAX_PROMPT_CHANGED_PATHS = 200;

export interface AssembledReviewPrompt {
	readonly promptText: string;
	readonly inputCoverage: ReviewInputCoverage;
}

export function systemPromptFindings(): string {
	return readPromptAsset("review_system_findings.md").trim();
}

export function reviewPromptTemplate(): string {
	return readPromptAsset("review_prompt.md");
}

export function assembleReviewPrompt(
	request: Pick<HarnessReviewRequest, "reviewDefinition" | "target">,
): AssembledReviewPrompt {
	const sizedDiff = promptSizedDiff(request.target.localDiff);
	const changedPaths = formatChangedPaths(request.target.localDiff.changedPaths);
	const promptText = renderNamedTemplate(reviewPromptTemplate(), {
		review_name: request.reviewDefinition.name,
		review_description: request.reviewDefinition.description,
		review_instructions: request.reviewDefinition.instructions,
		base_ref: request.target.localDiff.baseRef,
		changed_path_count: String(request.target.localDiff.changedPaths.length),
		changed_paths: changedPaths,
		diff_block: renderPromptFence(sizedDiff.diffText, { language: "diff" }),
	}).trim();

	return { promptText, inputCoverage: sizedDiff.inputCoverage };
}

export function renderPromptFence(content: string, options: { readonly language: string }): string {
	const longestRun = longestBacktickRun(content);
	const fence = "`".repeat(Math.max(3, longestRun + 1));
	return `${fence}${options.language}\n${content}\n${fence}`;
}

function formatChangedPaths(changedPaths: readonly string[]): string {
	if (changedPaths.length === 0) return "(no changed paths reported)";

	const listedPaths = changedPaths.slice(0, MAX_PROMPT_CHANGED_PATHS).map((path) => `- ${path}`);
	if (changedPaths.length <= MAX_PROMPT_CHANGED_PATHS) return listedPaths.join("\n");

	const omittedCount = changedPaths.length - MAX_PROMPT_CHANGED_PATHS;
	return [
		...listedPaths,
		`... ${omittedCount} additional changed paths omitted from prompt metadata; use repository tools if you need the full path list.`,
	].join("\n");
}

function renderNamedTemplate(template: string, fields: Record<string, string>): string {
	let rendered = template;
	for (const [name, value] of Object.entries(fields)) {
		rendered = rendered.replaceAll(`{${name}}`, value);
	}
	return rendered;
}

function readPromptAsset(name: string): string {
	return readFileSync(fileURLToPath(new URL(`../prompts/${name}`, import.meta.url)), "utf8");
}

function longestBacktickRun(content: string): number {
	let longest = 0;
	for (const match of content.matchAll(/`+/g)) {
		longest = Math.max(longest, match[0].length);
	}
	return longest;
}
