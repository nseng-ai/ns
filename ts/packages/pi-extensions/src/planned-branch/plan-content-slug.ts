import { readFile } from "node:fs/promises";

import { formatOutputSection } from "../command-runtime.ts";
import { deriveSlugWithModel, type SlugModelEvidence } from "../model-slug.ts";
import { validatePlanSlug, type PlanCommandExecApi } from "@asdl/planned-branch";

const MAX_ERROR_CHARS = 4_000;
const MAX_PLAN_SLUG_WORDS = 7;

export const MAX_PLAN_CONTENT_CHARS = 32_000;

export type PlanContentSlugEvidence = SlugModelEvidence;

export function normalizePlanContentSlugOutput(value: string): string | undefined {
	const firstLine = firstNonEmptyModelOutputLine(value);
	if (firstLine === undefined) {
		return undefined;
	}

	const slug = firstLine
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	const withoutPlanSuffix = slug.replace(/(?:-plan)+$/g, "").replace(/^-|-$/g, "");
	if (withoutPlanSuffix.length === 0) {
		return undefined;
	}

	const repaired = withoutPlanSuffix.split("-").filter(Boolean).slice(0, MAX_PLAN_SLUG_WORDS).join("-");
	return repaired.length > 0 ? repaired : undefined;
}

export async function derivePlanContentSlug(
	pi: PlanCommandExecApi,
	input: { filePath: string; cwd: string; signal?: AbortSignal | undefined },
): Promise<PlanContentSlugEvidence> {
	const content = await readFile(input.filePath, "utf8");
	const prompt = buildPlanContentSlugPrompt(content);
	const result = await deriveSlugWithModel({
		cwd: input.cwd,
		prompt,
		...(input.signal === undefined ? {} : { signal: input.signal }),
		slugKind: "planned-branch slug",
		normalizeOutput: normalizePlanContentSlugOutput,
		exec: (command, args, options) => pi.exec(command, args, options),
	});
	if (!result.ok) {
		throw slugDerivationFailed(result.failure.lines);
	}

	const { slug, rawOutput } = result.evidence;
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw slugDerivationFailed([
			"Pi slug model output normalized to an invalid planned-branch slug.",
			`Normalized slug: ${slug}`,
			`Reason: ${slugError}`,
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	return result.evidence;
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
		truncatePlanContentForSlug(content.trim() || "(empty plan content)"),
	].join("\n");
}

export function truncatePlanContentForSlug(content: string): string {
	if (content.length <= MAX_PLAN_CONTENT_CHARS) {
		return content;
	}
	return `${content.slice(0, MAX_PLAN_CONTENT_CHARS)}\n\n[Plan content truncated for slug generation]`;
}

function firstNonEmptyModelOutputLine(value: string): string | undefined {
	return value
		.replace(/```[\s\S]*?```/g, (match) => match.replace(/```[a-zA-Z]*\n?|```/g, ""))
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
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

