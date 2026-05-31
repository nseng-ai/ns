import { readFile } from "node:fs/promises";

import { sanitizeBranchName } from "../branch-slug.ts";
import { formatCommand, formatOutputSection } from "../command-runtime.ts";
import { validatePlanSlug, type PlanCommandExecApi } from "./plan-persistence.ts";

const PLAN_SLUG_PROVIDER = "openai";
const PLAN_SLUG_MODEL = "gpt-5.4-nano";
const SLUG_TIMEOUT_MS = 60_000;
const MAX_ERROR_CHARS = 4_000;

export const MAX_PLAN_CONTENT_CHARS = 32_000;

export type PlanContentSlugEvidence = {
	slug: string;
	rawOutput: string;
	provider: string;
	model: string;
};

export async function derivePlanContentSlug(
	pi: PlanCommandExecApi,
	input: { filePath: string; cwd: string; signal?: AbortSignal | undefined },
): Promise<PlanContentSlugEvidence> {
	const content = await readFile(input.filePath, "utf8");
	const prompt = buildPlanContentSlugPrompt(content);
	const args = [
		"--provider",
		PLAN_SLUG_PROVIDER,
		"--model",
		PLAN_SLUG_MODEL,
		"--thinking",
		"low",
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
	const displayCommand = formatCommand("pi", [...args.slice(0, -1), "<slug-prompt>"]);

	let result: Awaited<ReturnType<PlanCommandExecApi["exec"]>>;
	try {
		result = await pi.exec("pi", args, execOptions(input.cwd, SLUG_TIMEOUT_MS, input.signal));
	} catch (error) {
		throw slugDerivationFailed([
			"Pi slug model command failed before completion.",
			`Command: ${displayCommand}`,
			`Error: ${error instanceof Error ? error.message : String(error)}`,
		]);
	}

	if (result.code !== 0 || result.killed) {
		const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
		throw slugDerivationFailed([
			`Pi slug model command failed (${status}).`,
			`Command: ${displayCommand}`,
			formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
			formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	const rawOutput = result.stdout;
	if (rawOutput.trim().length === 0) {
		throw slugDerivationFailed(["Pi slug model returned empty output."]);
	}

	const slug = sanitizeBranchName(rawOutput);
	if (slug === undefined) {
		throw slugDerivationFailed([
			"Pi slug model output could not be normalized into a planned-branch slug.",
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw slugDerivationFailed([
			"Pi slug model output normalized to an invalid planned-branch slug.",
			`Normalized slug: ${slug}`,
			`Reason: ${slugError}`,
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	return { slug, rawOutput, provider: PLAN_SLUG_PROVIDER, model: PLAN_SLUG_MODEL };
}

export function buildPlanContentSlugPrompt(content: string): string {
	return [
		"Generate the planned-branch slug for the Markdown implementation plan content below.",
		"Use only the plan content. Do not use any saved-plan filename or path.",
		"Return exactly one slug and no prose.",
		"Rules:",
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Use 3–7 words.",
		"- Make the slug specific to the implementation described by the plan.",
		"- Prefer concrete deliverables and nouns from the plan body.",
		"- Do not use dates, random IDs, generic-only slugs, or the saved-plan filename.",
		"",
		"## Plan content",
		truncatePlanContent(content.trim() || "(empty plan content)"),
	].join("\n");
}

function truncatePlanContent(content: string): string {
	if (content.length <= MAX_PLAN_CONTENT_CHARS) {
		return content;
	}
	return `${content.slice(0, MAX_PLAN_CONTENT_CHARS)}\n\n[Plan content truncated for slug generation]`;
}

function slugDerivationFailed(lines: string[]): Error {
	return new Error(
		[
			"Failed to derive planned-branch slug from plan content.",
			...lines,
			"No filename or deterministic fallback was attempted.",
		].join("\n"),
	);
}

function execOptions(cwd: string, timeout: number, signal: AbortSignal | undefined): { cwd: string; timeout: number; signal?: AbortSignal } {
	if (signal === undefined) {
		return { cwd, timeout };
	}
	return { cwd, timeout, signal };
}
