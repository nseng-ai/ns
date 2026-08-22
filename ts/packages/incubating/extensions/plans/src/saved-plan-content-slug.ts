import {
	deriveContentSlug,
	type ContentSlugContext,
	type ContentSlugEvidence,
	type ContentSlugPolicy,
	type DeriveContentSlugInput,
} from "@nseng-ai/extension-kit/content-slug";
import { MAX_PLAN_SLUG_WORDS, MIN_PLAN_SLUG_WORDS, validatePlanSlug } from "./plan-persistence.ts";

const MAX_PLAN_CONTENT_CHARS = 32_000;

export type SavedPlanContentSlugEvidence = ContentSlugEvidence;

export interface PlanContentSlugPresentation {
	slugKind: string;
	promptIntroLines: readonly string[];
	invalidSlugMessage: string;
	failureHeader: string;
	noFallbackLine: string;
}

const SAVED_PLAN_PRESENTATION = {
	slugKind: "saved-plan filename slug",
	promptIntroLines: [
		"Generate the saved-plan filename slug for the Markdown implementation plan content below.",
		"Use only the final plan content. Do not use the current branch, repository name, request text, filename, or path.",
	],
	invalidSlugMessage: "Pi slug model output normalized to an invalid saved-plan filename slug.",
	failureHeader: "Failed to derive saved-plan filename slug from plan content.",
	noFallbackLine: "No assistant-generated slug or deterministic fallback was attempted.",
} satisfies PlanContentSlugPresentation;

export async function derivePlanSlugFromContent(
	context: ContentSlugContext,
	input: DeriveContentSlugInput,
	presentation: PlanContentSlugPresentation,
): Promise<SavedPlanContentSlugEvidence> {
	const policy = {
		...presentation,
		promptRuleLines: [
			"- Use lowercase ASCII kebab-case words separated by single hyphens.",
			`- Use ${MIN_PLAN_SLUG_WORDS}–${MAX_PLAN_SLUG_WORDS} words.`,
			"- Make the slug specific to the implementation described by the plan.",
			"- Prefer concrete deliverables and nouns from the plan body.",
			"- Do not use dates, random IDs, generic-only slugs, or the saved-plan filename.",
		],
		contentHeading: "## Plan content",
		emptyContentPlaceholder: "(empty plan content)",
		maxContentChars: MAX_PLAN_CONTENT_CHARS,
		truncationMessage: "[Plan content truncated for slug generation]",
		normalization: {
			maxWords: MAX_PLAN_SLUG_WORDS,
			stripSuffixes: ["-plan"],
		},
		validateSlug: validatePlanSlug,
	} satisfies ContentSlugPolicy;
	return deriveContentSlug(context, input, policy);
}

export async function deriveSavedPlanContentSlug(
	context: ContentSlugContext,
	input: DeriveContentSlugInput,
): Promise<SavedPlanContentSlugEvidence> {
	return derivePlanSlugFromContent(context, input, SAVED_PLAN_PRESENTATION);
}
