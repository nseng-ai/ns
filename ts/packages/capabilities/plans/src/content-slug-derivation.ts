import {
	buildKitContentSlugPrompt,
	deriveKitContentSlug,
	normalizeContentSlugOutput,
	truncateContentForSlug,
	type ContentSlugEvidence,
	type KitContentSlugDerivationVariant,
} from "@nseng-ai/capability-kit/content-slug";
import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { MAX_PLAN_SLUG_WORDS, MIN_PLAN_SLUG_WORDS, validatePlanSlug } from "./plan-persistence.ts";

export const MAX_PLAN_CONTENT_CHARS = 32_000;

export interface PlanContentSlugVariantSeed {
	slugKind: string;
	promptIntroLines: readonly string[];
	invalidSlugMessage: string;
	failureHeader: string;
	noFallbackLine: string;
}

export interface DeriveContentSlugInput {
	content: string;
	cwd: string;
	signal?: AbortSignal;
}

export type { ContentSlugEvidence };

export async function deriveContentSlug(
	pi: CommandExecApi,
	input: DeriveContentSlugInput,
	variant: PlanContentSlugVariantSeed,
): Promise<ContentSlugEvidence> {
	return deriveKitContentSlug(
		{ exec: (command, args, options) => pi.exec(command, args, options) },
		input,
		toKitContentSlugVariant(variant),
	);
}

export function buildContentSlugPrompt(
	content: string,
	variant: PlanContentSlugVariantSeed,
): string {
	return buildKitContentSlugPrompt(content, toKitContentSlugVariant(variant));
}

const PLAN_CONTENT_SLUG_NORMALIZATION = {
	maxWords: MAX_PLAN_SLUG_WORDS,
	stripSuffixes: ["-plan"],
} satisfies KitContentSlugDerivationVariant["normalization"];

const PLAN_CONTENT_SLUG_TRUNCATION = {
	maxContentChars: MAX_PLAN_CONTENT_CHARS,
	truncationMessage: "[Plan content truncated for slug generation]",
} satisfies Pick<KitContentSlugDerivationVariant, "maxContentChars" | "truncationMessage">;

export function normalizePlanContentSlugOutput(value: string): string | undefined {
	return normalizeContentSlugOutput(value, PLAN_CONTENT_SLUG_NORMALIZATION);
}

export function truncatePlanContentForSlug(content: string): string {
	return truncateContentForSlug(content, PLAN_CONTENT_SLUG_TRUNCATION);
}

function toKitContentSlugVariant(
	variant: PlanContentSlugVariantSeed,
): KitContentSlugDerivationVariant {
	return {
		...variant,
		promptRuleLines: [
			"- Use lowercase ASCII kebab-case words separated by single hyphens.",
			`- Use ${MIN_PLAN_SLUG_WORDS}–${MAX_PLAN_SLUG_WORDS} words.`,
			"- Make the slug specific to the implementation described by the plan.",
			"- Prefer concrete deliverables and nouns from the plan body.",
			"- Do not use dates, random IDs, generic-only slugs, or the saved-plan filename.",
		],
		contentHeading: "## Plan content",
		emptyContentPlaceholder: "(empty plan content)",
		...PLAN_CONTENT_SLUG_TRUNCATION,
		normalization: PLAN_CONTENT_SLUG_NORMALIZATION,
		validateSlug: validatePlanSlug,
	};
}
