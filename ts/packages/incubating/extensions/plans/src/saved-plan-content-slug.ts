import {
	deriveContentSlug,
	type ContentSlugEvidence,
	type ContentSlugPolicy,
	type ContentSlugResult,
	type DeriveContentSlugInput,
} from "@nseng-ai/extension-kit/content-slug";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { MAX_PLAN_SLUG_WORDS, MIN_PLAN_SLUG_WORDS, validatePlanSlug } from "./plan-persistence.ts";

const MAX_PLAN_CONTENT_CHARS = 32_000;

export type SavedPlanContentSlugEvidence = ContentSlugEvidence;
export type SavedPlanContentSlugResult = ContentSlugResult;

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
	commands: CommandExecApi,
	input: DeriveContentSlugInput,
	presentation: PlanContentSlugPresentation,
): Promise<SavedPlanContentSlugResult> {
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
	return deriveContentSlug(commands, input, policy);
}

export async function deriveSavedPlanContentSlug(
	commands: CommandExecApi,
	input: DeriveContentSlugInput,
): Promise<SavedPlanContentSlugResult> {
	return derivePlanSlugFromContent(commands, input, SAVED_PLAN_PRESENTATION);
}
