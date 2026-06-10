import { formatOutputSection, type CommandExecApi } from "@asdl/core/exec";
import { deriveSlugWithModel, type SlugModelEvidence } from "./model-slug.ts";
import { validatePlanSlug } from "./plan-persistence.ts";

const MAX_ERROR_CHARS = 4_000;
const MAX_PLAN_SLUG_WORDS = 7;

export const MAX_PLAN_CONTENT_CHARS = 32_000;

export interface ContentSlugDerivationVariant {
	slugKind: string;
	promptIntroLines: readonly string[];
	invalidSlugMessage: string;
	failureHeader: string;
	noFallbackLine: string;
}

export interface DeriveContentSlugInput {
	content: string;
	cwd: string;
	signal?: AbortSignal | undefined;
}

export type ContentSlugEvidence = SlugModelEvidence;

export async function deriveContentSlug(
	pi: CommandExecApi,
	input: DeriveContentSlugInput,
	variant: ContentSlugDerivationVariant,
): Promise<ContentSlugEvidence> {
	const prompt = buildContentSlugPrompt(input.content, variant);
	const result = await deriveSlugWithModel({
		cwd: input.cwd,
		prompt,
		...(input.signal === undefined ? {} : { signal: input.signal }),
		slugKind: variant.slugKind,
		normalizeOutput: normalizePlanContentSlugOutput,
		exec: (command, args, options) => pi.exec(command, args, options),
	});
	if (!result.ok) {
		throw slugDerivationFailed(variant, result.failure.lines);
	}

	const { slug, rawOutput } = result.evidence;
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) {
		throw slugDerivationFailed(variant, [
			variant.invalidSlugMessage,
			`Normalized slug: ${slug}`,
			`Reason: ${slugError}`,
			formatOutputSection("stdout", rawOutput, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		]);
	}

	return result.evidence;
}

export function buildContentSlugPrompt(content: string, variant: ContentSlugDerivationVariant): string {
	return [
		...variant.promptIntroLines,
		"Return exactly one slug and no prose.",
		"Rules:",
		"- Use lowercase ASCII kebab-case words separated by single hyphens.",
		"- Use 3–7 words.",
		"- Make the slug specific to the implementation described by the plan.",
		"- Prefer concrete deliverables and nouns from the plan body.",
		"- Do not use dates, random IDs, generic-only slugs, or the saved-plan filename.",
		"",
		"## Plan content",
		truncatePlanContentForSlug(displayPlanContentForSlug(content)),
	].join("\n");
}

function displayPlanContentForSlug(content: string): string {
	const trimmed = content.trim();
	return trimmed.length > 0 ? trimmed : "(empty plan content)";
}

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

function slugDerivationFailed(variant: ContentSlugDerivationVariant, lines: readonly string[]): Error {
	return new Error([variant.failureHeader, ...lines, variant.noFallbackLine].join("\n"));
}
